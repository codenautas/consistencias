"use strict";

import { ProcedureContext, OperativoGenerator } from "operativos";
import { ConsistenciasGenerator, Consistencia } from "./types-consistencias";

type ConsistenciasPk = {operativo: string, consistencia: string}

var procedures = [
    {
        action:'consistencia_compilar',
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
        action:'consistencia_correr',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'consistencia'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            let operativoGenerator = new OperativoGenerator(params.operativo);
            await operativoGenerator.fetchDataFromDB(context.client);
            await (await Consistencia.fetchOne(context.client, params.operativo, params.consistencia)).correr()
            return 'listo';
        }
    },
    {
        action:'consistencias_compilar',
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
                    // en lugar de llamar al método compilar, llamar al procedure consistencia_compilar, contando los ok:true y ok:false
                    await consistencia.compilar(context.client);
                })
            })
            await cdp;
            // mostrar cuantas compilaron y cuantas no
            return {ok:true, message:'consistencias compiladas'};
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

