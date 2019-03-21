import * as bestGlobals from "best-globals";
import * as EP from "expre-parser";
import { quoteIdent, quoteLiteral } from "pg-promise-strict";
import { compilerOptions, getWrappedExpression, hasAlias, Relacion, VarCalculator, Variable } from "varcal";
import { Consistencia, ConVar } from "./types-consistencias";

export class ConCompiler extends VarCalculator{
    
    myCons: Consistencia[];
    myConVars: ConVar[];

    static calculatingAllVars:boolean=false;
    static lastCalculateAllVars: any = bestGlobals.timeInterval(bestGlobals.datetime.now()).sub(bestGlobals.timeInterval({seconds:60}));
    //static lastCalculateAllVars: any = bestGlobals.datetime.now().sub(bestGlobals.timeInterval({seconds:60}));
   
    async fetchDataFromDB() {
        await super.fetchDataFromDB();
        this.myCons = await Consistencia.fetchAll(this.client, this.operativo);
        this.myConVars = await ConVar.fetchAll(this.client, this.operativo);
        
        // put in Varcal
        this.optionalRelations = this.myRels.filter(rel => rel.tipo == 'opcional');
    }
    
    // PARA SUBIR A OPERATIVOS
    static mainTD: string;
    static mainTDPK: string;
    static orderedIngresoTDNames: string[];
    static orderedReferencialesTDNames: string[];

    static orderedTDNames(): any {
        return ConCompiler.orderedIngresoTDNames.concat(ConCompiler.orderedReferencialesTDNames);
    }

    // FIN PARA SUBIR A OPERATIVOS
    /////////////////////////
    // PARA SUBIR VARCAL

    optionalRelations: Relacion[];
    
    private validateAliases(aliases: string[]): any {
        let validAliases=this.getValidAliases();
        aliases.forEach(alias=>{
            if (validAliases.indexOf(alias) == -1) {
                throw new Error('El alias "' + alias + '" no se encontró en la lista de alias válidos: ' + validAliases.join(', '));
            }
        });
    }
    private getValidAliases(): string[]{
        let validRelationsNames = this.optionalRelations.map(rel=>rel.que_busco)
        return this.myTDs.map(td=>td.tabla_datos).concat(validRelationsNames);
    }
    private validateFunctions(funcNames: string[]) {
        let pgWitheList = ['div', 'avg', 'count', 'max', 'min', 'sum', 'coalesce'];
        let comunSquemaWhiteList = ['informado'];
        let functionWhiteList = pgWitheList.concat(comunSquemaWhiteList);
        funcNames.forEach(f => {
            if (hasAlias(f)) {
                if (f.split('.')[0] != 'dbo') {
                    throw new Error('La Función ' + f + ' contiene un alias inválido');
                }
            } else {
                if (functionWhiteList.indexOf(f) == -1) {
                    throw new Error('La Función ' + f + ' no está incluida en la whiteList de funciones: ' + functionWhiteList.toString());
                }
            }
        })
    }

    validateCondInsumos(insumos:EP.Insumos): void {    
        this.validateFunctions(insumos.funciones);
        this.validateAliases(insumos.aliases);
    }

    private findValidVar(varName: string):{varFound:Variable,relation?:string} {
        let rawVarName = varName;
        let varsFound:Variable[] = this.myVars;
        let relation:string;
        if (hasAlias(varName)) {
            let varAlias = varName.split('.')[0];
            rawVarName = varName.split('.')[1];

            let relAlias = this.optionalRelations.find(rel => rel.que_busco == varAlias)
            if (relAlias){
                relation=varAlias;
                varAlias=relAlias.tabla_busqueda;
            }

            varsFound = varsFound.filter(v => v.tabla_datos == varAlias);
        }
        varsFound = varsFound.filter(v => v.variable == rawVarName);
        this.VarsFoundErrorChecks(varsFound, varName);
        return {varFound:varsFound[0], relation};
    }

    private VarsFoundErrorChecks(varsFound:Variable[], varName: string){
        if (varsFound.length > 1) {
            throw new Error('La variable "' + varName + '" se encontró mas de una vez en las siguientes tablas de datos: ' + varsFound.map(v => v.tabla_datos).join(', '));
        }
        if (varsFound.length <= 0) {
            throw new Error('La variable "' + varName + '" no se encontró en la lista de variables.');
        }
        if (!varsFound[0].activa) { throw new Error('La variable "' + varName + '" no está activa.'); }
    }
    private addMainTD(insumosAliases: string[]) {
        //aliases involved in this consistence expresion
        if (insumosAliases.indexOf(ConCompiler.mainTD) == -1) {
            insumosAliases.push(ConCompiler.mainTD);
        }
        return insumosAliases;
    }

    private filterOrderedTDs(ec:ExpressionContainer) {
        //put in constructor
        // TODO: ORDENAR dinamicamente:
        // primero: la td que no tenga ninguna TD en que busco es la principal
        // segundas: van todas las tds que tengan en "que_busco" a la principal
        // terceras: las tds que tengan en "que busco" a las segundas
        // provisoriamente se ordena fijando un arreglo ordenado
        // TODO: deshardcodear main TD
        
        let insumosAliases = this.addMainTD(ec.getInsumosAliases());
        ec.notOrderedInsumosOptionalRelations = this.optionalRelations.filter(r => insumosAliases.indexOf(r.que_busco) > -1);
        let orderedInsumosIngresoTDNames:string[] = ConCompiler.orderedIngresoTDNames.filter(orderedTDName => insumosAliases.indexOf(orderedTDName) > -1);
        let orderedInsumosReferencialesTDNames:string[]= ConCompiler.orderedReferencialesTDNames.filter(orderedTDName => insumosAliases.indexOf(orderedTDName) > -1);
        ec.orderedInsumosTDNames = orderedInsumosIngresoTDNames.concat(orderedInsumosReferencialesTDNames);
        ec.lastTD = this.getUniqueTD(orderedInsumosIngresoTDNames[orderedInsumosIngresoTDNames.length - 1]);
        ec.firstTD = this.getUniqueTD(ConCompiler.mainTD);
    }

    buildClausulaWhere(ec:ExpressionContainer):string {
        // this.precondicion = getWrappedExpression(this.precondicion, lastTD.getQuotedPKsCSV(), compilerOptions);
        // this.postcondicion = getWrappedExpression(this.postcondicion, lastTD.getQuotedPKsCSV(), compilerOptions);
        // this.precondicion = addAliasesToExpression(this.precondicion, EP.parse(this.precondicion).getInsumos(), this.opGen.myVars, this.opGen.myTDs);
        // this.postcondicion = addAliasesToExpression(this.postcondicion, EP.parse(this.postcondicion).getInsumos(), this.opGen.myVars, this.opGen.myTDs);
        // this.clausula_where = `WHERE ${this.getMixConditions()} IS NOT TRUE`;

        let sanitizedExp = getWrappedExpression(ec.getExpression(), ec.lastTD.getQuotedPKsCSV(), compilerOptions);
        sanitizedExp = this.addAliasesToExpression(sanitizedExp, EP.parse(sanitizedExp).getInsumos(), this.myVars, this.myTDs);
        let clausula_where = `WHERE ${sanitizedExp} IS NOT TRUE`;
        clausula_where = this.salvarFuncionInformado(clausula_where);
        return clausula_where
    }

    salvarFuncionInformado(clausula_where:string) {
        //TODO: sacar esto de acá
        var regex = /\binformado\(null2zero\(([^()]+)\)\)/gi
        function regexFunc(_x: string, centro: string) {
            return 'informado(' + centro + ')';
        }
        clausula_where = clausula_where.replace(regex, regexFunc);

        // this.clausula_where = this.clausula_where.replace(new RegExp('\binformado\(null2zero\(([^()]+)\)\)', 'gi'), '$1' + replaceStr + '$3');
        return clausula_where;
    }
    buildClausulaFrom(ec:ExpressionContainer): string {
        let firstTD = this.getUniqueTD(ec.orderedInsumosTDNames[0]); //tabla mas general (padre)
        let clausula_from = 'FROM ' + quoteIdent(firstTD.getTableName());
        for (let i = 1; i < ec.orderedInsumosTDNames.length; i++) {
            let leftInsumoAlias = ec.orderedInsumosTDNames[i - 1];
            let rightInsumoAlias = ec.orderedInsumosTDNames[i];
            clausula_from += this.joinTDs(leftInsumoAlias, rightInsumoAlias);
        }
        //TODO: en el futuro habría que validar que participe del from la tabla de busqueda 
        ec.notOrderedInsumosOptionalRelations.forEach(r=>clausula_from += this.joinRelation(r));
        
        return clausula_from;
    }

    // FIN PARA SUBIR VARCAL 

    validateCondInsumosReloadedMethod(con:Consistencia): void {    
        // call super
        this.validateCondInsumos(con.insumos)
        con.insumosConVars.push(...this.validateVarsAndBuildConVar(con.insumos.variables));
    }

    private validateVarsAndBuildConVar(varNames: string[]): ConVar[]{
        let insumosConVars: ConVar[]
        // chequear que todas las variables de la cond existan en alguna tabla (sino se llena el campo error_compilacion)
        varNames.forEach(varName => {
            let {varFound, relation} = this.findValidVar(varName);
            insumosConVars.push(ConVar.buildFrom(varFound, relation));
        });
        return insumosConVars
    }

    //chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres) 
    private buildSQLExpression(con:Consistencia) {
        // TODO: agregar validación de funciones de agregación, esto es: si la consistencia referencia variables de tablas mas específicas (personas)
        // pero lo hace solo con funciones de agregación, entonces, los campos pk son solo de la tabla mas general, y no de la específica
        // TODO: separar internas de sus calculadas y que el último TD se tome de las internas 
        con.campos_pk = con.lastTD.getPKsWitAlias().join(',');
        con.clausula_from = this.buildClausulaFrom(con);
        con.clausula_where = this.buildClausulaWhere(con);
    }

    /**
     * El proceso de compilar una consistencia consiste en:
     * 1) valida la expresión de la consistencia 
     *  a. Chequea que la expresión sea un SQL válido
     *  b. Chequea insumos (variables y funciones) válidos y correctos 
     * 2) Construye el SQL (que se usará para correr la consistencia)
     * 3) Chequea el SQL generado ejecutandolo con un select
     * 4) Si todo salió bien guarda los SQL generados y marca consistencia como válida, sino
     *  tira error informando el motivo
     * 
     * Los SQL generados de una consistencia serán usados luego para correr la consistencia
     */
    async compile(con:Consistencia) {
        try {
            this.preCompile(con);
            this.buildSQLExpression(con);
            await this.testBuiltSQL(con);
            con.markAsValid();
        } catch (error) {
            con.compilationFails(error);
        }
        finally {
            await con.updateDB(this.client);
        }
    }
    preCompile(con: Consistencia): any {
        con.prepare()
        this.validateCondInsumosReloadedMethod(con);
        this.filterOrderedTDs(con); //tabla mas específicas (hija)
    }

    private async testBuiltSQL(con:Consistencia) {
        // TODO: deshardcodear id_caso de todos lados y operativo también! Pero pidió Emilio que se haga después 
        let selectQuery = this.getCompleteQuery(con);
        var result = await this.client.query('select try_sql($1) as error_informado', [selectQuery]).fetchOneRowIfExists();
        if(result.row.error_informado){
            throw new Error(result.row.error_informado);
        }
    }

    getCompleteQuery(con: Consistencia): string {
        return `${con.getCompleteQuery(con.insumosConVars)}
        AND ${quoteIdent(ConCompiler.mainTD)}.operativo=${quoteLiteral(this.operativo)}
        AND ${quoteIdent(ConCompiler.mainTD)}.${quoteIdent(ConCompiler.mainTDPK)}='-1'`
    }
    





    async compileAndRun(conName:string): Promise<void> {
        let con = this.myCons.find(c=>c.consistencia == conName);
        await this.compile(con);
        await this.fetchDataFromDB(); // reload data from db // this.myConVars = con.insumosConVars
        await this.consistir(null, con);
    }

    // async compilar(con: Consistencia){
    //     await con.compilar(this.client);
    //     await this.consistir(null,con);
    // }

    async consistir(idCaso?:string, consistenciaACorrer?:Consistencia){
        //se verifica si vino idCaso
        //TODO generalizar con mainTD y deshardcodear id_caso
        // y cuando se generalice tener en cuenta que pueden ser mas de una pk (hoy es solo una mainTDPK)
        let mainTDCondition = '';
        let pkIntegradaCondition = '';
        let pkIntegradaConditionConAlias = '';
        let updateMainTDCondition = '';
        if(idCaso){
            updateMainTDCondition = `AND ${quoteIdent(ConCompiler.mainTDPK)} = ${quoteLiteral(idCaso)}`;
            mainTDCondition = `AND ${quoteIdent(ConCompiler.mainTD)}.${quoteIdent(ConCompiler.mainTDPK)}=${quoteLiteral(idCaso)}`;
            pkIntegradaCondition = `AND pk_integrada->>${quoteLiteral(ConCompiler.mainTDPK)}=${quoteLiteral(idCaso)}`;
            pkIntegradaConditionConAlias = `AND i.pk_integrada->>${quoteLiteral(ConCompiler.mainTDPK)}=${quoteLiteral(idCaso)}`;
        }
        // se verifica si vino una consistencia única a correr, sino se correrán todas
        let consistencias:Consistencia[];
        let consistenciaCondition ='';
        if (consistenciaACorrer){
            consistenciaCondition = `AND consistencia=${quoteLiteral(consistenciaACorrer.consistencia)}`;
            consistencias = [consistenciaACorrer];
        } else {
            consistencias = await Consistencia.fetchAll(this.client, this.operativo);
        }
        
        await this.calculateVars(idCaso);
        
        // Delete all inconsistencias_ultimas
        await this.client.query(`DELETE FROM inconsistencias_ultimas WHERE operativo=$1 ${pkIntegradaCondition} ${consistenciaCondition}`, [this.operativo]).execute();
        
        let esto = this;
        var cdpConsistir = Promise.resolve();
        // se corre cada consistencia
        consistencias.filter(c=>c.activa && c.valida).forEach(function(consistencia){
            cdpConsistir = cdpConsistir.then(async function(){
                let misConVars = esto.myConVars.filter((cv:ConVar)=>cv.consistencia==consistencia.consistencia);
                // insert en inconsistencias_ultimas
                let query= `
                    INSERT INTO inconsistencias_ultimas(operativo, consistencia, pk_integrada, incon_valores)
                      ${consistencia.getCompleteQuery(misConVars)}
                        AND ${quoteIdent(ConCompiler.mainTD)}.operativo=$1
                        ${mainTDCondition}`;
                await esto.client.query(query ,[esto.operativo]).execute();
            })
        })
        await cdpConsistir;

        // insertar nuevas inconsistencias
        // TODO se está forzando a las últimas 3 queries a tener el alias i (para inconsistencias_ultimas sería iu)
        await this.client.query(`
            INSERT INTO inconsistencias (operativo, consistencia, pk_integrada)
              SELECT operativo, consistencia, pk_integrada
                FROM inconsistencias_ultimas 
                WHERE (operativo, consistencia, pk_integrada) NOT IN (select operativo, consistencia, pk_integrada FROM inconsistencias)
                  AND pk_integrada->>'operativo'=$1
                  ${pkIntegradaCondition}
        `, [this.operativo]).execute();
        
        // borra inconsistencias viejas
        await this.client.query(`
            DELETE FROM inconsistencias
              WHERE (operativo, consistencia, pk_integrada) NOT IN (select operativo, consistencia, pk_integrada FROM inconsistencias_ultimas)
                AND pk_integrada->>'operativo'=$1 ${pkIntegradaCondition}`, [this.operativo]).execute();
        
        // actualiza inconsistencias con los datos de la última corrida
        await this.client.query(`
        UPDATE inconsistencias i 
          SET vigente=true, corrida=current_timestamp, incon_valores=iu.incon_valores,
            justificacion = CASE WHEN i.incon_valores=iu.incon_valores THEN i.justificacion ELSE null END,
            justificacion_previa = CASE WHEN (i.incon_valores=iu.incon_valores OR i.justificacion is NULL) THEN i.justificacion_previa ELSE i.justificacion END
          FROM inconsistencias_ultimas iu
          WHERE iu.operativo = i.operativo
            AND iu.consistencia = i.consistencia
            AND iu.pk_integrada = i.pk_integrada
            AND i.pk_integrada->>'operativo'=$1
            ${pkIntegradaConditionConAlias}
        `, [this.operativo]).execute();

        if(! consistenciaACorrer) {
            // actualiza campo consistido de grupo_personas solo si se corren todas las consistencias
            await this.client.query(`
            UPDATE ${quoteIdent(ConCompiler.mainTD)}
              SET consistido=current_timestamp
              WHERE operativo = $1
            ${updateMainTDCondition}
            `, [this.operativo]).execute();
        }
        return 'ok';
    }
    
    // TODO: comento para que falle y revisar las referencias a varcal_provisorio
    // private async calculateVars(idCaso: string|undefined): Promise<void> {
    //     if(idCaso){
    //         await this.client.query(`SELECT varcal_provisorio_por_encuesta($1, $2)`, [this.operativo, idCaso]).execute();
    //     }else{
    //         //semaphore
    //         //var now = bestGlobals.datetime.now();
    //         var now = bestGlobals.timeInterval(bestGlobals.datetime.now());
    //         if (!Compiler.calculatingAllVars && now.sub(Compiler.lastCalculateAllVars)>bestGlobals.timeInterval({ms:100000})) {
    //             Compiler.calculatingAllVars = true;
    //             let varCalculationResult = this.client.query(`SELECT varcal_provisorio_total($1)`, [this.operativo]).execute();
    //             await varCalculationResult;
    //             Compiler.calculatingAllVars = false;
    //             Compiler.lastCalculateAllVars = now;
    //         } else {
    //             await varCalculationResult;
    //         }
    //     }
    // }
}