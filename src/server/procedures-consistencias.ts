"use strict";

import { OperativoGenerator, ProcedureContext } from "operativos";
import { ConCompiler } from "./compiler";
import { Consistencia } from "./types-consistencias";
import { AppConsistenciasType } from "./app-consistencias";

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
                let compiler = new ConCompiler(context.be as AppConsistenciasType, context.client, params.operativo);
                await compiler.fetchDataFromDB();
                await compiler.compileAndRun(params.consistencia);

                return {ok:true, message:'consistencia compilada y consistida'};
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
            let compiler = new ConCompiler(context.be as AppConsistenciasType, context.client, params.operativo);
            await compiler.fetchDataFromDB();
            let cons = await Consistencia.fetchAll(context.client, params.operativo);

            let countFails = 0;
            var cdp = Promise.resolve();
            let consistenciasActivas = cons.filter(c=>c.activa);
            consistenciasActivas.forEach(function(consistencia){
                cdp = cdp.then(async function(){
                    await compiler.compile(consistencia);
                }).catch(function(){countFails++})
            })
            await cdp;
            if (countFails > 0){
                return {ok:false, message: (consistenciasActivas.length - countFails) + ' consistencias compiladas exitosamente sobre un total de ' + consistenciasActivas.length + ' activas (solo compilación, no se consistieron)'};
            } else {
                return {ok:true, message: 'compilaron exitosamente todas las consistencias activas:' + consistenciasActivas.length};
            }
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
            
            let compiler = new ConCompiler(context.be as AppConsistenciasType, context.client, params.operativo);
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
            
            let compiler = new ConCompiler(context.be as AppConsistenciasType, context.client, params.operativo);
            await compiler.fetchDataFromDB();
            await compiler.consistir(parameters.id_caso);
            return 'listo';
        }
    }
];

export { procedures };

