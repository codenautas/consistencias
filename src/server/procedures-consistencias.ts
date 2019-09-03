"use strict";

import { ProcedureContext, coreFunctionParameters } from "varcal";
import { ConCompiler } from "./con-compiler";
import { Consistencia } from "./types-consistencias";

var procedures = [
    {
        action:'compilar_consistencias',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
        ],
        coreFunction:async function(context:ProcedureContext, params: coreFunctionParameters){
            let compiler = new ConCompiler(context.client, params.operativo);
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
        action:'compilar_y_correr_consistencia',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'consistencia'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: coreFunctionParameters){
            //compilar y consistir dicha consistencia (correr para todas las encuestas)
            try{
                let compiler = new ConCompiler(context.client, params.operativo);
                await compiler.fetchDataFromDB();
                await compiler.compileAndRun(params.consistencia);

                return {ok:true, message:'consistencia compilada y consistida'};
            }catch(error){
                return {ok:false, message:error.message};
            }
        }
    },
    {
        action:'consistir_encuesta',
        parameters:[
            {name:'operativo', typeName:'text'},
            {name:'id_caso'  , typeName:'text'}
        ],
        coreFunction:async function(context:ProcedureContext, parameters:coreFunctionParameters){
            // consistir_encuesta := correr todas las consistencias para dicha encuesta
            try{
                let compiler = new ConCompiler(context.client, parameters.operativo);
                await compiler.fetchDataFromDB();
                await compiler.consistir(parameters.id_caso);
                return {ok:true, message:'Encuesta consistida'};
            }catch(error){
                return {ok:false, message:error.message};
            }
        }
    },
    {
        action:'consistir_encuestas',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
        ],
        coreFunction:async function(context:ProcedureContext, params: coreFunctionParameters){
            try{
                let compiler = new ConCompiler(context.client, params.operativo);
                await compiler.fetchDataFromDB();
                await compiler.consistir();
                return {ok:true, message:'Se consistieron todas la encuestas'};
            }catch(error){
                return {ok:false, message:error.message};
            }
        }
    }
];

export { procedures };

