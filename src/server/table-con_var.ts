"use strict";
import {TableContext,TableDefinition} from "operativos"

function con_var(context:TableContext):TableDefinition{
    var admin = context.user.rol === 'admin';
    return {
        name: 'con_var',
        elementName: 'con_var',
        editable: admin,
        fields: [
            {name:"operativo"        , typeName:'text'         },
            {name:"con"              , typeName:'text'         },
            {name:"variable"         , typeName:'text'         },
            {name:"tabla_datos"      , typeName:'text'         },
            {name:"texto"            , typeName:'text'         },
        ],
        primaryKey: ['operativo','con','variable','tabla_datos'],
        foreignKeys:[
            {references:'consistencias', fields:['operativo', 'con']},
            {references:'variables', fields:['operativo','tabla_datos','variable']},
            {references:'tabla_datos', fields:['operativo','tabla_datos']},
        ],
    }
}

export {con_var};