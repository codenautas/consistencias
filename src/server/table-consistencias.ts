"use strict";
import {TableContext,TableDefinition} from "operativos"

export function consistencias(context:TableContext):TableDefinition{
    var admin = context.user.rol === 'admin';
    return {
        name: 'consistencias',
        elementName: 'consistencia',
        editable: admin,
        fields: [
            { name: "operativo"       , typeName:'text'     },
            { name: "con"             , typeName: "text"    },
            { name: "precondicion"    , typeName: "text"    },
            { name: "postcondicion"   , typeName: "text"    },
            { name: "activa"          , typeName: "boolean" },
            // { name: "explicacion"     , typeName: "text"    },
            // { name: "tipo"            , typeName: "text"    },
            // { name: "momento"         , typeName: "text"    },
            // { name: "modulo"          , typeName: "text"    },
            { name: "valida"          , typeName: "boolean" , editable:false},
            
        ],
        primaryKey: ['operativo','con'],
        foreignKeys:[
            {references:'operativos', fields:['operativo']},
        ],
        detailTables: [
            { table: 'con_var', fields: ['operativo', 'con'], abr: 'V', label: 'variables' }
        ]
    }
}

