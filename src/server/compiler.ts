import { OperativoGenerator } from "varcal";
import { Consistencia, ConVar } from "./types-consistencias";
import { quoteLiteral, quoteIdent, Result } from "pg-promise-strict";
import * as bestGlobals from "best-globals";

export class Compiler extends OperativoGenerator{
    myCons: Consistencia[];
    myConVars: ConVar[];

    static calculatingAllVars:boolean=false;
    static lastCalculateAllVars: any = bestGlobals.timeInterval(bestGlobals.datetime.now()).sub(bestGlobals.timeInterval({seconds:60}));
    //static lastCalculateAllVars: any = bestGlobals.datetime.now().sub(bestGlobals.timeInterval({seconds:60}));
    static varCalculation: Promise<Result>;
    
    
    async fetchDataFromDB() {
        await super.fetchDataFromDB();
        this.myCons = await Consistencia.fetchAll(this.client, this.operativo);
        this.myConVars = await ConVar.fetchAll(this.client, this.operativo);
    }
    
    async compileAndRun(conName:string): Promise<void> {
        let con = this.myCons.find(c=>c.consistencia == conName);
        await con.compilar(this.client);
        await this.fetchDataFromDB(); // reload data from db // this.myConVars = con.insumosConVars
        await this.consistir(null, con);
    }

    async compilar(con: Consistencia){
        await con.compilar(this.client);
        await this.consistir(null,con);
    }

    async consistir(idCaso?:string, consistenciaACorrer?:Consistencia){
    
        //se verifica si vino idCaso
        //TODO generalizar con mainTD y deshardcodear id_caso
        // y cuando se generalice tener en cuenta que pueden ser mas de una pk (hoy es solo una mainTDPK)
        let mainTDCondition = '';
        let pkIntegradaCondition = '';
        let pkIntegradaConditionConAlias = '';
        let updateMainTDCondition = '';
        if(idCaso){
            updateMainTDCondition = `AND ${quoteIdent(Consistencia.mainTDPK)} = ${quoteLiteral(idCaso)}`;
            mainTDCondition = `AND ${quoteIdent(Consistencia.mainTD)}.${quoteIdent(Consistencia.mainTDPK)}=${quoteLiteral(idCaso)}`;
            pkIntegradaCondition = `AND pk_integrada->>${quoteLiteral(Consistencia.mainTDPK)}=${quoteLiteral(idCaso)}`;
            pkIntegradaConditionConAlias = `AND i.pk_integrada->>${quoteLiteral(Consistencia.mainTDPK)}=${quoteLiteral(idCaso)}`;
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
                    SELECT 
                        ${consistencia.getCompleteClausule(misConVars)}
                        AND ${quoteIdent(Consistencia.mainTD)}.operativo=$1
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
            UPDATE ${quoteIdent(Consistencia.mainTD)}
              SET consistido=current_timestamp
              WHERE operativo = $1
            ${updateMainTDCondition}
            `, [this.operativo]).execute();
        }
        return 'ok';
    }
    
    private async calculateVars(idCaso: string|undefined): Promise<void> {
        if(idCaso){
            await this.client.query(`SELECT varcal_provisorio_por_encuesta($1, $2)`, [this.operativo, idCaso]).execute();
        }else{
            //semaphore
            //var now = bestGlobals.datetime.now();
            var now = bestGlobals.timeInterval(bestGlobals.datetime.now());
            if (!Compiler.calculatingAllVars && now.sub(Compiler.lastCalculateAllVars)>bestGlobals.timeInterval({ms:100000})) {
                Compiler.calculatingAllVars = true;
                Compiler.varCalculation = this.client.query(`SELECT varcal_provisorio_total($1)`, [this.operativo]).execute();
                await Compiler.varCalculation;
                Compiler.calculatingAllVars = false;
                Compiler.lastCalculateAllVars = now;
            } else {
                await Compiler.varCalculation;
            }
        }
    }
}