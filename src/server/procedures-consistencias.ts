"use strict";

import { CoreFunctionParameters, ProcedureContext } from "varcal";
import { ConCompiler } from "./con-compiler";
import { Consistencia } from "./types-consistencias";

var procedures = [
    {
        action:'compilar_consistencias',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
        ],
        coreFunction:async function(context:ProcedureContext, params: CoreFunctionParameters<{ operativo: string }>){
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
        action:'compilar_consistencia',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'consistencia'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: CoreFunctionParameters<{ operativo: string; consistencia: string }>){
            //compilar y consistir dicha consistencia (correr para todas las encuestas)
            try{
                let compiler = new ConCompiler(context.client, params.operativo);
                await compiler.fetchDataFromDB();
                
                await compiler.compile(<Consistencia>compiler.myCons.find(c=>c.consistencia == params.consistencia));

                return {ok:true, message:'consistencia compilada'};
            }catch(error:any){
                return {ok:false, message:error.message};
            }
        }
    },
    {
        action:'compilar_y_correr_consistencia',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'consistencia'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: CoreFunctionParameters<{ operativo: string; consistencia: string }>){
            //compilar y consistir dicha consistencia (correr para todas las encuestas)
            try{
                let compiler = new ConCompiler(context.client, params.operativo);
                await compiler.fetchDataFromDB();
                await compiler.compileAndRun(params.consistencia);

                return {ok:true, message:'consistencia compilada y consistida'};
            }catch(error:any){
                return {ok:false, message:error.message};
            }
        }
    },    
    // {
    //     action:'compilar_y_correr_todas_las_consistencia',
    //     parameters:[
    //         {name:'operativo'  , typeName:'text', references:'operativos'}
    //     ],
    //     coreFunction:async function(context:ProcedureContext, params: CoreFunctionParameters<{ operativo: string}>){
    //         try{
    //             let compiler = new ConCompiler(context.client, params.operativo);
    //             await compiler.fetchDataFromDB();
    //             compiler.myCons.forEach(async c=> {await compiler.compileAndRun(c.consistencia)})

    //             return {ok:true, message:'todas las consistencias compiladas y consistidas en todos los casos'};
    //         }catch(error:any){
    //             return {ok:false, message:error.message};
    //         }
    //     }
    // },
    {
        action:'consistir_encuesta',
        parameters:[
            {name:'operativo', typeName:'text'},
            {name:'id_caso'  , typeName:'text'}
        ],
        coreFunction:async function(context:ProcedureContext, parameters:CoreFunctionParameters<{ operativo: string; id_caso: string }>){
            // consistir_encuesta := correr todas las consistencias para dicha encuesta
            try{
                let compiler = new ConCompiler(context.client, parameters.operativo);
                await compiler.fetchDataFromDB();
                await compiler.consistir(parameters.id_caso);
                return {ok:true, message:'Encuesta consistida'};
            }catch(error:any){
                return {ok:false, message:error.message};
            }
        }
    },
    {
        action:'consistir_encuestas',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'}
        ],
        coreFunction:async function(context:ProcedureContext, params: CoreFunctionParameters<{ operativo: string}>){
            try{
                let compiler = new ConCompiler(context.client, params.operativo);
                await compiler.fetchDataFromDB();
                await compiler.consistir();
                return {ok:true, message:'Se consistieron todas la encuestas'};
            }catch(error:any){
                return {ok:false, message:error.message};
            }
        }
    }
];

export { procedures };

