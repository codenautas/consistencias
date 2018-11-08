"use strict";

import { ProcedureContext, OperativoGenerator } from "operativos";
import { ConsistenciasGenerator, Consistencia } from "./types-consistencias";

type ConsistenciasPk = {operativo: string, con: string}

var procedures = [
    {
        action:'consistencia/compilar',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'con'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            let operativoGenerator = new OperativoGenerator(params.operativo);
            await operativoGenerator.fetchDataFromDB(context.client);
            (await Consistencia.fetchOne(context.client, params.operativo, params.con)).compilar(context.client)
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
            (await Consistencia.fetchOne(context.client, params.operativo, params.con)).correr()
        }
    },
    {
        action:'consistencias/compilar',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
        ],
        coreFunction:async function(context:ProcedureContext, params: {operativo: string}){
            let consistenciaGenerator = new ConsistenciasGenerator(params.operativo);
            await consistenciaGenerator.fetchDataFromDB(context.client);
            consistenciaGenerator.myCons.forEach(con=> con.compilar(context.client));
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
        }
    }
];

export { procedures };

