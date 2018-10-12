"use strict";

import {ProcedureContext} from "operativos";
import { AppConsistenciasType } from "./app-consistencias";
import { Consistencia } from "../consistencias";
import { ConsistenciasPk } from "./types-consistencias";

var procedures = [
    {
        action:'consistencias/compilar',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'con'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            let be = context.be as AppConsistenciasType;
            be.compilar(context.client, params);
        }
    },
    {
        action:'consistencias/correr',
        parameters:[
            {name:'operativo'  , typeName:'text', references:'operativos'},
            {name:'con'        , typeName:'text', references:'consistencias'},
        ],
        coreFunction:async function(context:ProcedureContext, params: ConsistenciasPk){
            let be = context.be as AppConsistenciasType;
            be.correr(context.client, params);
        }
    }
];

export {procedures};
