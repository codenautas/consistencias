import { ExpressionProcessor, Variable, quoteIdent, quoteLiteral, ResultCommand, Consistencia, ConVar } from "./types-consistencias";
import { hasAlias, getAlias } from "varcal";

export class ConCompiler extends ExpressionProcessor{
    
    myCons: Consistencia[] = [];
    myConVars: ConVar[] = [];

    static calculatingAllVars:boolean=false;
    // static lastCalculateAllVars: any = bestGlobals.timeInterval(bestGlobals.datetime.now()).sub(bestGlobals.timeInterval({seconds:60}));
    tmpConVars: ConVar[] = [];
    static varCalculation: Promise<ResultCommand>;

    
    //static lastCalculateAllVars: any = bestGlobals.datetime.now().sub(bestGlobals.timeInterval({seconds:60}));
   
    async fetchDataFromDB() {
        await super.fetchDataFromDB();
        this.myCons = await Consistencia.fetchAll(this.client, this.operativo);
        this.myConVars = await ConVar.fetchAll(this.client, this.operativo);
    }

    //chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres) 
    private buildSQLExpression(con:Consistencia) {
        // TODO: agregar validación de funciones de agregación, esto es: si la consistencia referencia variables de tablas mas específicas (personas)
        // pero lo hace solo con funciones de agregación, entonces, los campos pk son solo de la tabla mas general, y no de la específica
        // TODO: separar internas de sus calculadas y que el último TD se tome de las internas 
        con.campos_pk = con.lastTD.getPKsWitAlias().join(',');
        con.clausula_from = this.buildClausulaFrom(con);
        con.setClausulaWhere();   
    }

    protected buildClausulaFrom(con:Consistencia): string {
        return 'FROM ' + this.buildEndToEndJoins(con.lastTD.tabla_datos) + this.buildOptRelationsFromClausule(con.insumosOptionalRelations);
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
            this.prepareEC(con);
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
    
    //overrides super
    prepareEC(con:Consistencia): any {
        con.prepare();
        super.prepareEC(con);
        con.expresionProcesada = this.getWrappedExpression(con.expresionProcesada, con.lastTD.getQuotedPKsCSV());
        this.pushAllInConVars(con);
    }

    pushAllInConVars(con: Consistencia): void {
        con.insumosConVars.push(...this.tmpConVars)
        this.tmpConVars = [];
    }

    //overrides super to add treatment for consistencia ConVars
    // @ts-ignore is not used here directly but in validateVars (super class' method)
    protected validateVar(varName: string): Variable {
        let varFound:Variable = super.validateVar(varName);
        this.addConVar(varName, varFound);
        return varFound;
    }

    private addConVar(varName: string, varFound: Variable) {
        let optRelation = hasAlias(varName)? this.getOptionalRelation(getAlias(varName)): undefined;
        this.tmpConVars.push(ConVar.buildFrom(varFound, optRelation));
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
        let con = <Consistencia>this.myCons.find(c=>c.consistencia == conName);
        await this.compile(con);
        await this.fetchDataFromDB(); // reload data from db // this.myConVars = con.insumosConVars
        await this.consistir(undefined, con);
    }

    async consistir(idCaso?:string, consistenciaACorrer?:Consistencia){
        // TODO: ver como validar si se está consistiendo una con valida
        // if (!this.valida) {
        //     throw new Error('La consistencia ' + this.consistencia + ' debe haber compilado exitosamente');
        // }
        //se verifica si vino idCaso
        //TODO generalizar con mainTD y deshardcodear id_caso
        // y cuando se generalice tener en cuenta que pueden ser mas de una pk (hoy es solo una mainTDPK)
        let mainTDCondition = '';
        let pkIntegradaCondition = '';
        let pkIntegradaConditionConAlias = '';
        // let updateMainTDCondition = '';
        if(idCaso){
            // updateMainTDCondition = `AND ${quoteIdent(ConCompiler.mainTDPK)} = ${quoteLiteral(idCaso)}`;
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
        
        // client query (await this.calculate(idCaso))
        await this.calculateVars(idCaso);

        // Delete all inconsistencias_ultimas
        await this.client.query(`DELETE FROM inconsistencias_ultimas WHERE operativo=$1 ${pkIntegradaCondition} ${consistenciaCondition}`, [this.operativo]).execute();
        
        let esto = this;
        var cdpConsistir = Promise.resolve();
        // se corre cada consistencia
        consistencias.filter(con=>con.activa && con.valida).forEach(function(con){
            cdpConsistir = cdpConsistir.then(async function(){
                let misConVars = esto.myConVars.filter((cv:ConVar)=>cv.consistencia==con.consistencia);
                // insert en inconsistencias_ultimas
                const selectForInsert = 
                    `${con.getCompleteQuery(misConVars)} AND ${quoteIdent(ConCompiler.mainTD)}.operativo=$1 ${mainTDCondition}`;
                const inconsToInsertResult = await esto.client.query(selectForInsert ,[esto.operativo]).execute();
                const enabledInconLimit = 450;
                if (inconsToInsertResult.rowCount > enabledInconLimit) {
                    throw new Error(`La consistencia ${con} arrojará mas de ${enabledInconLimit} inconsistencias.`);
                }
                await esto.client.query(`INSERT INTO inconsistencias_ultimas(operativo, consistencia, pk_integrada, incon_valores) ${selectForInsert}` 
                    ,[esto.operativo]).execute();
            })
        })
        await cdpConsistir;

        // insertar nuevas inconsistencias
        // TODO se está forzando a las últimas 3 queries a tener el alias i (para inconsistencias_ultimas sería iu)
        await this.client.query(`
          INSERT INTO inconsistencias (operativo, consistencia, pk_integrada)
            SELECT operativo, consistencia, pk_integrada
              FROM inconsistencias_ultimas iu
              WHERE not exists (
                    SELECT operativo, consistencia, pk_integrada FROM inconsistencias i 
                      WHERE i.operativo = iu.operativo AND i.pk_integrada = iu.pk_integrada AND i.consistencia = iu.consistencia
                  )
                AND operativo=$1 ${pkIntegradaCondition}`, [this.operativo]).execute();
        
        // borra inconsistencias viejas
        await this.client.query(`
          DELETE FROM inconsistencias i
            WHERE not exists (
              SELECT operativo, consistencia, pk_integrada FROM inconsistencias_ultimas iu
                WHERE iu.operativo=i.operativo and iu.consistencia=i.consistencia and iu.pk_integrada=i.pk_integrada
            ) AND operativo=$1 ${pkIntegradaConditionConAlias}`, [this.operativo]).execute();
        
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

        // if(! consistenciaACorrer) {
        //     // actualiza campo consistido de grupo_personas solo si se corren todas las consistencias
        //     await this.client.query(`
        //     UPDATE ${quoteIdent(ConCompiler.mainTD)}
        //       SET consistido=current_timestamp
        //       WHERE operativo = $1
        //     ${updateMainTDCondition}
        //     `, [this.operativo]).execute();
        // }
        return 'ok';
    }
    
    private async calculateVars(idCaso: string|undefined): Promise<void> {
        if(idCaso) {
            await this.client.query(`SELECT update_varcal_por_encuesta($1, $2)`, [this.operativo, idCaso]).execute();
        } else {
            //TODO: do a semaphore to allow press "compile" in several consistencias simultaneously
            ConCompiler.varCalculation = this.client.query(`SELECT update_varcal($1)`, [this.operativo]).execute();
            await ConCompiler.varCalculation;
        }
    }
}