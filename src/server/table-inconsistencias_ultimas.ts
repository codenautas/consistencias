"use strict";
import {TableContext,TableDefinition} from "varcal"

export function inconsistencias_ultimas(context:TableContext):TableDefinition{
    var admin = context.user.rol === 'admin';
    return {
        name: 'inconsistencias_ultimas',
        elementName: 'inconsistencias_ultima',
        editable: admin,
        fields: [
            { name: "operativo"            , typeName:'text'     },
            { name: "pk_integrada"         , typeName: 'jsonb'   },
            { name: "consistencia"         , typeName: "text"    },
            { name: "justificacion"        , typeName: "text" , editable: true   },
            { name: "justificacion_previa" , typeName: "text"    },
            { name: "autor_justificacion"  , typeName: "text"    },
            { name: "observacion"          , typeName: "text" , editable: true   },
            { name: "corrida"              , typeName: "timestamp"},
            { name: "vigente"              , typeName: "boolean"  },
            { name: "incon_valores"        , typeName: "jsonb"  },
        ],
        primaryKey: ['operativo', 'pk_integrada', 'consistencia'],
        foreignKeys:[
            {references:'operativos', fields:['operativo']},
            {references:'consistencias', fields:['operativo', 'consistencia']},
        ],
        // detailTables: [
        //     { table: 'in_con_var', fields: ['operativo', 'consistencia', 'pk_integrada'], abr: 'cv', label: 'in con vars' }
        // ]
    }
}

