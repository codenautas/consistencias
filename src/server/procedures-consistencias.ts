"use strict";

import { ProcedureContext, OperativoGenerator } from "operativos";
import { ConsistenciasGenerator, Consistencia, ConVar } from "./types-consistencias";
import { Compiler } from "./compiler";

type ConsistenciasPk = {operativo: string, consistencia: string}

var procedures = [
    {
        action:'compilar',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'consistencia'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            try{
                let operativoGenerator = new OperativoGenerator(params.operativo);
                await operativoGenerator.fetchDataFromDB(context.client);
                let con = await Consistencia.fetchOne(context.client, params.operativo, params.consistencia);
                await con.compilar(context.client)
                return {ok:true, message:'consistencia compilada'};
            }catch(error){
                return {ok:false, message:error.message};
            }
        }
    },
    {
        action:'compilar_todas',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
        ],
        coreFunction:async function(context:ProcedureContext, params: {operativo: string}){
            let operativoGenerator = new OperativoGenerator(params.operativo);
            await operativoGenerator.fetchDataFromDB(context.client);
            let cons = await Consistencia.fetchAll(context.client, params.operativo);

            var cdp = Promise.resolve();
            cons.filter(c=>c.activa).forEach(function(consistencia){
                cdp = cdp.then(async function(){
                    // en lugar de llamar al método compilar, llamar al procedure compilar, contando los ok:true y ok:false
                    await consistencia.compilar(context.client);
                })
            })
            await cdp;
            // mostrar cuantas compilaron y cuantas no
            return {ok:true, message:'consistencias compiladas'};
        }
    },
    {
        action:'correr',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'consistencia'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            // correr una consistencia = consistir todos los casos en dicha consistencia

            let operativoGenerator = new OperativoGenerator(params.operativo);
            await operativoGenerator.fetchDataFromDB(context.client);
            await (await Consistencia.fetchOne(context.client, params.operativo, params.consistencia)).correr()
            return 'listo';

            // opcion 1
            // Calcular todas las variables calculadas
            // getAllCasos
            // para cada caso
                // consistencia.correr(id_casoStr)
                    /*
                    delete inconsistencias_ultimas
                    insert inconsistencias_ultimas
                    // actualizo inconsistencias
                        insert inconsistencias (las nuevas)
                        delete inconsistencias (las viejas)
                        update justificación y just previa
                    */


            // opcion 2
            // Calcular todas las variables calculadas
            // getAllCasos
            // delete inconsistencias_ultimas
            // para cada caso
                // consistencia.correr(id_casoStr)
                    // insert inconsistencias_ultimas
            // actualizo inconsistencias
            // insert inconsistencias (las nuevas)
            // delete inconsistencias (las viejas)
            // update justificación y just previa
        }
    },
    {
        action:'consistir_encuesta',
        parameters:[
            {name:'operativo', typeName:'text'},
            {name:'id_caso'  , typeName:'text'}
        ],
        coreFunction:async function(context:ProcedureContext, parameters:any){
            // consistir_encuesta = correr todas las consistencias para dicha encuesta
            let idCasoStr = parameters.id_caso.toString();
            let params = [parameters.operativo, idCasoStr];
            
            // let compiler = new Compiler(parameters.operativo);
            // await compiler.fetchDataFromDB(context.client);
            // compiler.consistirCaso(idCasoStr)

            // se corre VARCAL
            await context.client.query(`SELECT varcal_provisorio_por_encuesta($1, $2)`, params).execute();
            var consistencias = await Consistencia.fetchAll(context.client, parameters.operativo);
            
            // Delete all inconsistencias_ultimas
            await context.client.query(`DELETE FROM inconsistencias_ultimas WHERE operativo=$1 AND pk_integrada->>'id_caso'=$2`, params).execute();
            
            var conVars = await ConVar.fetchAll(context.client, parameters.operativo);
            var cdp = Promise.resolve();
            let operativoGenerator = new OperativoGenerator(parameters.operativo);
            await operativoGenerator.fetchDataFromDB(context.client);
            // se corre cada consistencia
            consistencias.filter(c=>c.activa && c.valida).forEach(function(consistencia){
                cdp = cdp.then(async function(){
                    let misConVars = conVars.filter((cv:ConVar)=>cv.consistencia==consistencia.consistencia);
                    // insert en inconsistencias_ultimas
                    let query= `
                        INSERT INTO inconsistencias_ultimas(operativo, consistencia, pk_integrada, incon_valores)
                        SELECT 
                            ${consistencia.getCompleteClausule(misConVars)}
                            AND grupo_personas.operativo=$1
                            AND grupo_personas.id_caso=$2`;
                    await context.client.query(query ,params).execute();
                })
            })
            await cdp;

            // insertar nuevas inconsistencias
            await context.client.query(`
                INSERT INTO inconsistencias (operativo, consistencia, pk_integrada)
                  SELECT operativo, consistencia, pk_integrada
                    FROM inconsistencias_ultimas
                    where (operativo, consistencia, pk_integrada) NOT IN (select operativo, consistencia, pk_integrada FROM inconsistencias)
                      AND pk_integrada->>'operativo'=$1
                      AND pk_integrada->>'id_caso'=$2
            `, params).execute();
            
            // borra inconsistencias viejas
            await context.client.query(`
                DELETE FROM inconsistencias 
                  where (operativo, consistencia, pk_integrada) NOT IN (select operativo, consistencia, pk_integrada FROM inconsistencias_ultimas)
                    AND pk_integrada->>'operativo'=$1
                    AND pk_integrada->>'id_caso'=$2
            `, params).execute();
            
            // actualiza inconsistencias con los datos de la última corrida
            await context.client.query(`
            UPDATE inconsistencias i 
              SET vigente=true, corrida=current_timestamp, incon_valores=iu.incon_valores,
                justificacion = CASE WHEN i.incon_valores=iu.incon_valores THEN i.justificacion ELSE null END,
                justificacion_previa = CASE WHEN i.incon_valores=iu.incon_valores THEN i.justificacion_previa ELSE i.justificacion END
              FROM inconsistencias_ultimas iu
              WHERE iu.operativo = i.operativo
                AND iu.consistencia = i.consistencia
                AND iu.pk_integrada = i.pk_integrada
                AND i.pk_integrada->>'operativo'=$1
                AND i.pk_integrada->>'id_caso'=$2
            `, params).execute();

            // actualiza campo consistido de grupo_personas
            await context.client.query(`
            UPDATE grupo_personas  
              SET consistido=current_timestamp
              WHERE operativo = $1
                AND id_caso = $2
            `, params).execute();
            return 'ok';
        }
    },
    {
        action:'consistencias_correr',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
        ],
        coreFunction:async function(context:ProcedureContext, params: {operativo: string}){
            let consistenciaGenerator = new ConsistenciasGenerator(params.operativo);
            await consistenciaGenerator.fetchDataFromDB(context.client);
            consistenciaGenerator.myCons.forEach(con=> con.correr());
            return 'listo';
        }
    }
];

export { procedures };

