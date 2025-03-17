"use strict";
import {TableContext,TableDefinition} from "varcal"

export function consistencias(context:TableContext):TableDefinition{
    var isAdmin=context.user.rol==='admin';
    var isProcesamiento=context.user.rol==='procesamiento' || isAdmin;
    return {
        name: 'consistencias',
        elementName: 'consistencia',
        editable: isProcesamiento,
        fields: [
            { name: "compilar"          , typeName:'bigint' , editable:false, clientSide:'compilar_enc'},
            { name: "consistir"         , typeName:'bigint' , editable:false, clientSide:'consistir_enc'},
            { name: "operativo"         , typeName:'text'     },
            { name: "consistencia"      , typeName: "text"    },
            { name: "precondicion"      , typeName: "text"    },
            { name: "postcondicion"     , typeName: "text"    , nullable:false},
            { name: "activa"            , typeName: "boolean" , nullable:false },
            { name: "clausula_from"     , typeName: "text"    , visible:false, editable:false},
            { name: "clausula_where"    , typeName: "text"    , visible:false, editable:false},
            { name: "first_td"          , typeName: "text"    , visible:false, editable:false},
            { name: "last_td"           , typeName: "text"    , visible:false, editable:false},
            { name: "campos_pk"         , typeName: "text"    , visible:false, editable:false},
            { name: "error_compilacion" , typeName: "text"    , editable:false},
            { name: "valida"            , typeName: "boolean" , editable:false},
            { name: "explicacion"       , typeName: "text"    , isName:true},
            { name: "falsos_positivos"  , typeName: "boolean"    },
            { name: "momento"           , typeName: "text"    , nullable:false},
            { name: "tipo"              , typeName: "text"    },
            { name: "modulo"            , typeName: "text"    },
            { name: "observaciones"         , typeName: "text"    },
            { name: "variables_de_contexto" , typeName: "text"    },
            { name: 'compilada'             , typeName:'timestamp'   , editable:false }
        ],
        primaryKey: ['operativo','consistencia'],
        foreignKeys:[
            {references:'operativos'            , fields:['operativo']},
            {references:'momento_consistencias' , fields:['operativo','momento']},
        ],
        detailTables: [
            { table: 'inconsistencias', fields: ['operativo', 'consistencia'], abr: 'I', label: 'Inconsistencias' },
            { table: 'con_var', fields: ['operativo', 'consistencia'], abr: 'V', label: 'variables' }
        ]
    }
}

