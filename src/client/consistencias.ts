"use strict";

// Si se pone código aquí para que funcione levantando como app:
// - procesamiento o cualquier app "superior" (hereda de AppConsistencias): hay que descomentar la linea 18 de app-consistencias.ts (agrega el nombre del archivo de clients)
// - consistencias: hay que hacer lo mismo que en linea 15 de app-procesamiento.ts (hacer push en allClientFileNames del archivo client propio )

"use strict";

import { html } from "js-to-html";
import * as myOwn from "myOwn";

function botonClientSideEnGrilla(opts: { nombreBoton: string, llamada: (depot: myOwn.Depot) => Promise<any> }) {
    return {
        prepare: function (depot: myOwn.Depot, fieldName: string) {
            var td = depot.rowControls[fieldName];
            var boton = html.button(opts.nombreBoton).create();
            td.innerHTML = "";
            td.appendChild(boton);
            var restaurarBoton = function () {
                boton.disabled = false;
                boton.textContent = opts.nombreBoton;
                boton.style.backgroundColor = '';
            }

            boton.onclick = function () {
                boton.disabled = true;
                boton.textContent = 'procesando...';
                opts.llamada(depot).then(function (result) {
                    // boton.disabled=false;
                    boton.textContent = '¡listo!';
                    boton.title = result;
                    boton.style.backgroundColor = '#8F8';
                    var grid = depot.manager;
                    grid.retrieveRowAndRefresh(depot).then(function () {
                        // setTimeout(restaurarBoton,3000);
                    }, function () {
                        // setTimeout(restaurarBoton,3000);
                    })
                }, function (err) {
                    boton.textContent = 'error';
                    boton.style.backgroundColor = '#FF8';
                    alertPromise(err.message).then(restaurarBoton, restaurarBoton);
                })
            }
        }
    };
}
myOwn.clientSides.compilar = botonClientSideEnGrilla({
    nombreBoton: 'compilar',
    llamada: function (depot: myOwn.Depot) {
        return depot.row.activa? myOwn.ajax.consistencia.compilar({
            operativo: depot.row.operativo,
            con: depot.row.con
        }): alert('Debe activar la consistencia para compilarla');
    }
});

myOwn.clientSides.compilarTodas = botonClientSideEnGrilla({
    nombreBoton: 'compilar todas',
    llamada: function (depot: myOwn.Depot) {
        return myOwn.ajax.consistencias.compilar({
            operativo: depot.row.operativo
        });
    }
});

// myOwn.clientSides.correr = botonClientSideEnGrilla({
//     nombreBoton: 'correr',
//     llamada: function (depot: myOwn.Depot) {
//         return myOwn.ajax.consistencia.correr({
//             operativo: depot.row.operativo,
//             con: depot.row.con
//         });
//     }
// });
