"use strict";
import {TableContext,TableDefinition} from "operativos"

export function consistencias(context:TableContext):TableDefinition{
    var admin = context.user.rol === 'admin';
    return {
        name: 'consistencias',
        elementName: 'consistencia',
        editable: admin,
        fields: [
            { name: "compilar"          , typeName:'bigint' , editable:false, clientSide:'compilar'},
            { name: "operativo"         , typeName:'text'     },
            { name: "consistencia"      , typeName: "text"    },
            { name: "precondicion"      , typeName: "text"    },
            { name: "postcondicion"     , typeName: "text"    , nullable:false},
            { name: "activa"            , typeName: "boolean" , nullable:false },
            { name: "clausula_from"     , typeName: "text"    , visible:false, editable:false},
            { name: "clausula_where"    , typeName: "text"    , visible:false, editable:false},
            { name: "campos_pk"         , typeName: "text"    , visible:false, editable:false},
            { name: "error_compilacion" , typeName: "text"    , visible:false, editable:false},
            { name: "valida"            , typeName: "boolean" , editable:false},
            { name: "explicacion"       , typeName: "text"    , isName:true},
            { name: "falsos_positivos"  , typeName: "boolean"    },
            { name: "momento"           , typeName: "text"    },
            { name: "tipo"              , typeName: "text"    },
            { name: "modulo"            , typeName: "text"    },
            { name: "observaciones"         , typeName: "text"    },
            { name: "variables_de_contexto" , typeName: "text"    },
            { name: 'compilada'             , typeName:'timestamp'   , editable:false },
            // { name: "correr"                , typeName:'bigint' , editable:false, clientSide:'correr'}
        ],
        primaryKey: ['operativo','consistencia'],
        foreignKeys:[
            {references:'operativos', fields:['operativo']},
        ],
        detailTables: [
            { table: 'inconsistencias', fields: ['operativo', 'consistencia'], abr: 'I', label: 'Inconsistencias' },
            { table: 'con_var', fields: ['operativo', 'consistencia'], abr: 'V', label: 'variables' }
        ]
    }
}

