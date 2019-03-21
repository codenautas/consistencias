import { Client } from 'pg-promise-strict';
import { Variable } from 'varcal';

export class ConVarDB {
    operativo: string
    consistencia: string
    expresion_var: string
    variable: string
    tabla_datos: string
    relacion: string
    texto: string
}

export class ConVar extends ConVarDB {
    static buildFrom(varFound: Variable, relation?: string): any {
        let cv = new ConVar()
        Object.assign(cv, <ConVar>{operativo: varFound.operativo, tabla_datos: varFound.tabla_datos, variable:varFound.variable, texto:varFound.nombre });
        cv.relacion = relation;
        return cv
    }
    buildExpresionVar(): string {
        return this.relacion? this.relacion + '.' + this.variable : this.variable;
    }
    static async fetchAll(client: Client, op: string): Promise<ConVar[]> {
        let result = await client.query(`SELECT * FROM con_var c WHERE c.operativo = $1`, [op]).fetchAll();
        return <ConVar[]>result.rows.map((cv: ConVar) => Object.setPrototypeOf(cv, ConVar.prototype));
    }
}
