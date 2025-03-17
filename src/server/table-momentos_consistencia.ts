"use strict";
import {TableContext,TableDefinition} from "varcal"

export function momentos_consistencia(context:TableContext):TableDefinition{
    var isAdmin=context.user.rol==='admin';
    var isProcesamiento=context.user.rol==='procesamiento' || isAdmin;
    return {
        name: 'momentos_consistencia',
        elementName: 'momento consistencia',
        editable: isProcesamiento,
        fields: [
            { name: "operativo"         , typeName: 'text'    },
            { name: "momento"           , typeName: "text"    },
            { name: "descripcion"       , typeName: "text", isName:true    },
        ],
        primaryKey: ['operativo','momento']
    }
}

