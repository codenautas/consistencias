"use strict";
import {TableDefinition} from "operativos"

function con_var():TableDefinition{
    return {
        name: 'con_var',
        elementName: 'con_var',
        editable: true,
        fields: [
            {name:"operativo"        , typeName:'text'         },
            {name:"con"              , typeName:'text'         },
            {name:"variable"         , typeName:'text'         },
            {name:"tabla_datos"      , typeName:'text'         },
            {name:"texto"            , typeName:'text'         },
        ],
        primaryKey: ['operativo','con', 'tabla_datos', 'variable'],
        foreignKeys:[
            {references:'consistencias', fields:['operativo', 'con']},
            {references:'variables', fields:['operativo', 'tabla_datos','variable']}
        ],
    }
}

export {con_var};