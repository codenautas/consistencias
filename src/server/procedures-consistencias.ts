"use strict";

import { ProcedureContext, OperativoGenerator } from "operativos";
import { ConsistenciasGenerator, Consistencia } from "./types-consistencias";

type ConsistenciasPk = {operativo: string, consistencia: string}

var procedures = [
    {
        action:'consistencia/compilar',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'con'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            // try{
                let operativoGenerator = new OperativoGenerator(params.operativo);
                await operativoGenerator.fetchDataFromDB(context.client);
                let con = await Consistencia.fetchOne(context.client, params.operativo, params.consistencia);
                await con.compilar(context.client)
                return 'listo';
            // }catch(e){
            //     return 'error compilación';
            // }
        }
    },
    {
        action:'consistencia/correr',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'con'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            let operativoGenerator = new OperativoGenerator(params.operativo);
            await operativoGenerator.fetchDataFromDB(context.client);
            await (await Consistencia.fetchOne(context.client, params.operativo, params.consistencia)).correr()
            return 'listo';
        }
    },
    {
        action:'consistencias/compilar',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
        ],
        coreFunction:async function(context:ProcedureContext, params: {operativo: string}){
            // try{
                let operativoGenerator = new OperativoGenerator(params.operativo);
                await operativoGenerator.fetchDataFromDB(context.client);
                let cons = await Consistencia.fetchAll(context.client, params.operativo);

                await Promise.all(cons.filter(c=>c.activa).map(async function(con){
                    await con.compilar(context.client);
                }));

                return 'listo';
            // }catch(e){
            //     return 'error compilación'
            // }
        }
    },
    {
        action:'consistencias/correr',
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

