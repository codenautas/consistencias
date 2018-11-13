"use strict";
import {TableDefinition} from "operativos"

export function in_con_var():TableDefinition{
    return {
        name: 'in_con_var',
        elementName: 'in_con_var',
        editable: false,
        fields: [
            {name:"operativo"        , typeName:'text'         },
            {name:"con"              , typeName:'text'         },
            {name:"pk_integrada"     , typeName:'jsonb'        },
            {name:"variable"         , typeName:'text'         },
            {name:"tabla_datos"      , typeName:'text'         },
            {name:"valor"            , typeName:'text'         },
        ],
        primaryKey: ['operativo','con','pk_integrada','tabla_datos', 'variable'],
        foreignKeys:[
            {references:'inconsistencias', fields:['operativo', 'con', 'pk_integrada']},
            {references:'con_var', fields:['operativo', 'con', 'tabla_datos','variable']}
        ],
    }
}
