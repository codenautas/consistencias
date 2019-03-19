import * as bestGlobals from "best-globals";
import { quoteIdent, quoteLiteral, Result } from "pg-promise-strict";
import { VarCalculator, getWrappedExpression, compilerOptions, Variable, Relacion } from "varcal";
import { Consistencia, ConVar } from "./types-consistencias";
import { TablaDatos } from "varcal";
import * as EP from "expre-parser";

export class ConCompiler extends VarCalculator{
    
    myCons: Consistencia[];
    myConVars: ConVar[];

    static calculatingAllVars:boolean=false;
    static lastCalculateAllVars: any = bestGlobals.timeInterval(bestGlobals.datetime.now()).sub(bestGlobals.timeInterval({seconds:60}));
    //static lastCalculateAllVars: any = bestGlobals.datetime.now().sub(bestGlobals.timeInterval({seconds:60}));
    static varCalculation: Promise<Result>;
    lastTD: TablaDatos;

    validVars: Variable[];
    optionalRelations: Relacion[];
   
    async fetchDataFromDB() {
        await super.fetchDataFromDB();
        this.myCons = await Consistencia.fetchAll(this.client, this.operativo);
        this.myConVars = await ConVar.fetchAll(this.client, this.operativo);

        // put in constructor 
        this.validVars = this.myVars.filter(v => ConCompiler.validTDNames().indexOf(v.tabla_datos) > -1);
        this.optionalRelations = this.myRels.filter(rel => rel.tipo == 'opcional');

    }
      
    static mainTD: string;
    static mainTDPK: string;
    static orderedIngresoTDNames: string[];
    static orderedReferencialesTDNames: string[];
      
    getCompleteQuery(con: Consistencia): string {
        return `${con.getCompleteQuery(con.insumosConVars)}
        AND ${quoteIdent(ConCompiler.mainTD)}.operativo=${quoteLiteral(this.operativo)}
        AND ${quoteIdent(ConCompiler.mainTD)}.${quoteIdent(ConCompiler.mainTDPK)}='-1'`
    }
    
    static validTDNames(): any {
        return ConCompiler.orderedIngresoTDNames.concat(ConCompiler.orderedReferencialesTDNames);
    }
    
    buildClausulaWhere(con:Consistencia):string {
        // this.precondicion = getWrappedExpression(this.precondicion, lastTD.getQuotedPKsCSV(), compilerOptions);
        // this.postcondicion = getWrappedExpression(this.postcondicion, lastTD.getQuotedPKsCSV(), compilerOptions);
        // this.precondicion = addAliasesToExpression(this.precondicion, EP.parse(this.precondicion).getInsumos(), this.opGen.myVars, this.opGen.myTDs);
        // this.postcondicion = addAliasesToExpression(this.postcondicion, EP.parse(this.postcondicion).getInsumos(), this.opGen.myVars, this.opGen.myTDs);
        // this.clausula_where = `WHERE ${this.getMixConditions()} IS NOT TRUE`;

        let sanitizedExp = getWrappedExpression(con.getMixConditions(), this.lastTD.getQuotedPKsCSV(), compilerOptions);
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

    getLastTDPKsWithAlias(): string {
      
      return this.lastTD.getPKsWitAlias().join(',');
    }
    
    buildClausulaFrom(con: Consistencia): string {

        //put in constructor
        // TODO: ORDENAR dinamicamente:
        // primero: la td que no tenga ninguna TD en que busco es la principal
        // segundas: van todas las tds que tengan en "que_busco" a la principal
        // terceras: las tds que tengan en "que busco" a las segundas
        // provisoriamente se ordena fijando un arreglo ordenado
        // TODO: deshardcodear main TD
        let insumosAliases: string[] = con.getInsumosAliases(); //aliases involved in this consistence expresion
        let orderedInsumosIngresoTDNames: string[] = ConCompiler.orderedIngresoTDNames.filter(orderedTDName => insumosAliases.indexOf(orderedTDName) > -1);
        let orderedInsumosReferencialesTDNames: string[] = ConCompiler.orderedReferencialesTDNames.filter(orderedTDName => insumosAliases.indexOf(orderedTDName) > -1);
        
        let orderedInsumosTDNames = orderedInsumosIngresoTDNames.concat(orderedInsumosReferencialesTDNames);
        let NOTOrderedInsumosOptionalRelations: Relacion[] = this.optionalRelations.filter(r => insumosAliases.indexOf(r.que_busco) > -1);
        
        this.lastTD = this.getUniqueTD(orderedInsumosIngresoTDNames[orderedInsumosIngresoTDNames.length - 1]); //tabla mas específicas (hija)

        let firstTD = this.getUniqueTD(orderedInsumosTDNames[0]); //tabla mas general (padre)
        let clausula_from = 'FROM ' + quoteIdent(firstTD.getTableName());
        for (let i = 1; i < orderedInsumosTDNames.length; i++) {
            let leftInsumoAlias = orderedInsumosTDNames[i - 1];
            let rightInsumoAlias = orderedInsumosTDNames[i];
            clausula_from += this.joinTDs(leftInsumoAlias, rightInsumoAlias);
        }
        //TODO: en el futuro habría que validar que participe del from la tabla de busqueda 
        NOTOrderedInsumosOptionalRelations.forEach(r=>clausula_from += this.joinRelation(r));
        
        return clausula_from;
    }

    async compileAndRun(conName:string): Promise<void> {
        let con = this.myCons.find(c=>c.consistencia == conName);
        await con.compilar(this);
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
    //             Compiler.varCalculation = this.client.query(`SELECT varcal_provisorio_total($1)`, [this.operativo]).execute();
    //             await Compiler.varCalculation;
    //             Compiler.calculatingAllVars = false;
    //             Compiler.lastCalculateAllVars = now;
    //         } else {
    //             await Compiler.varCalculation;
    //         }
    //     }
    // }
}