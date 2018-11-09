"use strict";
import {TableDefinition} from "operativos"

function con_var():TableDefinition{
    return {
        name: 'in_con_var',
        elementName: 'in_con_var',
        editable: false,
        fields: [
            {name:"operativo"        , typeName:'text'         },
            {name:"pk_integrada"     , typeName: 'jsonb'   },
            {name:"con"              , typeName:'text'         },
            {name:"variable"         , typeName:'text'         },
            {name:"tabla_datos"      , typeName:'text'         },
            {name:"texto"            , typeName:'text'         },
        ],
        primaryKey: ['operativo','con','variable','tabla_datos', 'pk_integrada'],
        foreignKeys:[
            {references:'inconsistencias', fields:['operativo', 'con', 'pk_integrada']},
            {references:'con_var', fields:['operativo', 'con', 'tabla_datos','variable']}
        ],
    }
}

export {con_var};