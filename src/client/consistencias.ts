"use strict";

import { html } from "js-to-html";

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
                opts.llamada(depot).then(function(result){
                    var grid = depot.manager;
                    grid.retrieveRowAndRefresh(depot).then(function(){
                        setTimeout(restaurarBoton,3000);
                    })
                    if(result && 'ok' in result){
                        if(result.ok){
                            return result.message;
                        }else{
                            throw new Error(result.message);
                        }
                    }else{
                        return result;
                    }
                }).then(function (result) {
                    // boton.disabled=false;
                    boton.textContent = '¡listo!';
                    boton.title = result;
                    boton.style.backgroundColor = '#8F8';
                    alertPromise(result);
                }, function (err) {
                    boton.textContent = 'error';
                    boton.style.backgroundColor = '#FF8';
                    alertPromise(err.message);
                })
            }
        }
    };
}
myOwn.clientSides.compilar = botonClientSideEnGrilla({
    nombreBoton: 'compilar y consistir',
    llamada: function (depot: myOwn.Depot) {
        return depot.row.activa? myOwn.ajax.compilar_consistencia({
            operativo: depot.row.operativo,
            consistencia: depot.row.consistencia
        }): alertPromise('Debe activar la consistencia para poder compilarla');
    }
});

myOwn.clientSides.compilarTodas = botonClientSideEnGrilla({
    nombreBoton: 'compilar todas',
    llamada: function (depot: myOwn.Depot) {
        return myOwn.ajax.compilar_todas_consistencias({
            operativo: depot.row.operativo
        });
    }
});

