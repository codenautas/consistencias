"use strict";
import {TableContext,TableDefinition} from "varcal"

export function inconsistencias(context:TableContext):TableDefinition{
    var isAdmin = context.user.rol === 'admin';
    var isProcesamiento = context.user.rol === 'procesamiento' || isAdmin;
    var def:TableDefinition = {
        name: 'inconsistencias',
        elementName: 'inconsistencia',
        editable: isProcesamiento,
        fields: [
            { name: "operativo"            , typeName:'text'     , editable: false},
            { name: "pk_integrada"         , typeName: 'jsonb'   , editable: false},
            { name: "consistencia"         , typeName: "text"    , editable: false },
            { name: "justificacion"        , typeName: "text" },
            { name: "justificacion_previa" , typeName: "text"    , editable: false},
            { name: "autor_justificacion"  , typeName: "text"    },
            { name: "observacion"          , typeName: "text"    },
            { name: "corrida"              , typeName: "timestamp" ,editable: false, visible: false},
            { name: "vigente"              , typeName: "boolean"   ,editable: false, inTable: false},
            { name: "incon_valores"        , typeName: "jsonb"     , editable: false},
            
            { name: "momento", typeName: "text", inTable: false    },

        ],
        primaryKey: ['operativo', 'pk_integrada', 'consistencia'],
        foreignKeys: [
            { references: 'operativos', fields: ['operativo'] },
            { references: 'consistencias', fields: ['operativo', 'consistencia'] },
        ],
        sql:{
            isTable:true,
                from:`(
                    SELECT i.*, (c.activa AND c.valida) as vigente, c.momento
                    FROM inconsistencias i 
                        LEFT JOIN consistencias c USING (operativo, consistencia)
                )`,
            // where:"consistencias.activa AND consistencias.valida"
        }
        // detailTables: [
        //     { table: 'in_con_var', fields: ['operativo', 'consistencia', 'pk_integrada'], abr: 'cv', label: 'in con vars' }
        // ]
    };
    return def;
}

