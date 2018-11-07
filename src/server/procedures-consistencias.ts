"use strict";

import {ProcedureContext} from "operativos";
import { ConsistenciasGenerator } from "./types-consistencias";

type ConsistenciasPk = {operativo: string, con: string}

var procedures = [
    {
        action:'consistencia/compilar',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'con'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            let consistenciaGenerator = new ConsistenciasGenerator(params.operativo);
            await consistenciaGenerator.fetchDataFromDB(context.client);
            consistenciaGenerator.myCons.find(con=> con.con == params.con).compilar();
        }
    },
    {
        action:'consistencia/correr',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'con'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            let consistenciaGenerator = new ConsistenciasGenerator(params.operativo);
            await consistenciaGenerator.fetchDataFromDB(context.client);
            consistenciaGenerator.myCons.find(con=> con.con == params.con).correr();
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
            consistenciaGenerator.myCons.forEach(con=> con.compilar());
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

