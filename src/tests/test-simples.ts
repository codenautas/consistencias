import * as discrepances from 'discrepances';
import 'mocha';

import { Consistencia } from '../server/consistencia';
import { ConVar } from '../server/convar';

// Los tests que necesitan base de datos no están acá: sólo se prueba lo que no depende de PostgreSQL.

function nuevaConsistencia(def: Partial<Consistencia>): Consistencia {
    return Object.assign(new Consistencia(), def);
}

describe("consistencias", function () {
    describe("fusionUserExpressions", function () {
        it("con precondición y postcondición", function () {
            var con = nuevaConsistencia({ precondicion: 'a > 1', postcondicion: 'b = 2' });
            con.fusionUserExpressions();
            discrepances.showAndThrow(con.expresionProcesada, '(a > 1 ) AND (b = 2) IS NOT TRUE');
        });
        it("sin precondición usa true", function () {
            var con = nuevaConsistencia({ postcondicion: 'b = 2' });
            con.fusionUserExpressions();
            discrepances.showAndThrow(con.expresionProcesada, '(true ) AND (b = 2) IS NOT TRUE');
        });
    });
    describe("estado de la compilación", function () {
        it("markAsValid marca la consistencia como válida", function () {
            var con = nuevaConsistencia({ consistencia: 'c1', operativo: 'o1' });
            con.markAsValid();
            discrepances.showAndThrow(con.valida, true);
            discrepances.showAndThrow(con.compilada instanceof Date, true);
        });
        it("prepare limpia lo generado en una compilación anterior", function () {
            var con = nuevaConsistencia({ consistencia: 'c1', operativo: 'o1', valida: true, compilada: new Date(), campos_pk: 'x.y', clausula_from: 'FROM x', clausula_where: 'WHERE 1', first_td: 'x', last_td: 'x', error_compilacion: 'e' });
            con.prepare();
            discrepances.showAndThrow(con.valida, false);
            discrepances.showAndThrow(
                [con.compilada, con.campos_pk, con.clausula_from, con.clausula_where, con.first_td, con.last_td, con.error_compilacion],
                [undefined, undefined, undefined, undefined, undefined, undefined, undefined]
            );
            discrepances.showAndThrow(con.insumosConVars, []);
        });
        it("compilationFails informa el motivo y la consistencia", function () {
            var con = nuevaConsistencia({ consistencia: 'c1', operativo: 'o1', valida: true });
            var mensaje: string = '';
            try {
                con.compilationFails(new Error('falla x'));
            } catch (err) {
                mensaje = (err as Error).message;
            }
            discrepances.showAndThrow(mensaje, 'falla x La consistencia "c1" del operativo "o1" es inválida.');
            discrepances.showAndThrow(con.valida, false);
            discrepances.showAndThrow(con.error_compilacion, 'falla x');
        });
    });
    describe("ConVar", function () {
        it("buildExpresionVar sin relación es sólo la variable", function () {
            var cv = Object.assign(new ConVar(), { variable: 'v', tabla_datos: 't' });
            discrepances.showAndThrow(cv.buildExpresionVar(), 'v');
        });
        it("buildExpresionVar con relación la antepone", function () {
            var cv = Object.assign(new ConVar(), { variable: 'v', tabla_datos: 't', relacion: 'rel' });
            discrepances.showAndThrow(cv.buildExpresionVar(), 'rel.v');
        });
    });
});
