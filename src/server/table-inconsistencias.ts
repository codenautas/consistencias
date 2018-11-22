"use strict";
import {TableContext,TableDefinition} from "operativos"

export function inconsistencias(context:TableContext):TableDefinition{
    var admin = context.user.rol === 'admin';
    return {
        name: 'inconsistencias',
        elementName: 'inconsistencia',
        editable: admin,
        fields: [
            { name: "operativo"            , typeName:'text'     },
            { name: "pk_integrada"         , typeName: 'jsonb'   },
            { name: "con"                  , typeName: "text"    , editable: false },
            { name: "justificacion"        , typeName: "text" },
            { name: "justificacion_previa" , typeName: "text"    , editable: false},
            { name: "autor_justificacion"  , typeName: "text"    },
            { name: "observacion"          , typeName: "text"    },
            { name: "corrida"              , typeName: "timestamp" ,editable: false, visible: false},
            { name: "vigente"              , typeName: "boolean"   ,editable: false, visible: false},
            { name: "incon_valores"        , typeName: "jsonb"     , editable: false},
        ],
        primaryKey: ['operativo', 'pk_integrada', 'con'],
        foreignKeys:[
            {references:'operativos', fields:['operativo']},
            {references:'consistencias', fields:['operativo', 'con']},
        ],
        // detailTables: [
        //     { table: 'in_con_var', fields: ['operativo', 'con', 'pk_integrada'], abr: 'cv', label: 'in con vars' }
        // ]
    }
}

