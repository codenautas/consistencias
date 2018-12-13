"use strict";

import { OperativoGenerator, ProcedureContext } from "operativos";
import { Compiler } from "./compiler";
import { Consistencia } from "./types-consistencias";

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
                let operativoGenerator = new OperativoGenerator(context.client, params.operativo);
                await operativoGenerator.fetchDataFromDB();
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
            let operativoGenerator = new OperativoGenerator(context.client, params.operativo);
            await operativoGenerator.fetchDataFromDB();
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
            
            let compiler = new Compiler(context.client, params.operativo);
            await compiler.fetchDataFromDB();
            let consistencia = compiler.myCons.find(c=>c.operativo==params.operativo && c.consistencia==params.consistencia);

            if (consistencia){
                await compiler.consistir(null, consistencia);
            } else {
                throw new Error('No se encontró la consistencia '+params.consistencia)
            }
            

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
            
            let compiler = new Compiler(context.client, parameters.operativo);
            await compiler.fetchDataFromDB();
            await compiler.consistir(idCasoStr);
        }
    }
];

export { procedures };

