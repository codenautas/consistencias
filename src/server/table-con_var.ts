"use strict";
import {TableDefinition} from "varcal"

export function con_var():TableDefinition{
    return {
        name: 'con_var',
        elementName: 'con_var',
        editable: true,
        fields: [
            {name:"operativo"        , typeName:'text'         },
            {name:"consistencia"     , typeName:'text'         },
            {name:"expresion_var"     , typeName:'text'         },
            {name:"variable"         , typeName:'text', nullable:false         },
            {name:"tabla_datos"      , typeName:'text', nullable:false         },
            {name:"relacion"         , typeName:'text'         },
            {name:"texto"            , typeName:'text'         },
        ],
        primaryKey: ['operativo','consistencia', 'expresion_var'],
        foreignKeys:[
            {references:'consistencias', fields:['operativo', 'consistencia'], onDelete: 'cascade'},
            {references:'variables', fields:['operativo', 'tabla_datos','variable']}
            //TODO: agregar un fk de campo relacion a tabla relaciones
        ],
    }
}