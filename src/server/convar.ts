import { Client, Variable } from './types-consistencias';
import { Relacion } from 'varcal';

export interface ConVarDB {
    operativo: string
    consistencia: string
    expresion_var: string
    variable: string
    tabla_datos: string
    relacion?: string
    texto?: string
}

export class ConVar implements ConVarDB {
    operativo!: string
    consistencia!: string
    expresion_var!: string
    variable!: string
    tabla_datos!: string
    relacion?: string
    texto?: string

    static buildFrom(varFound: Variable, relation?: Relacion): any {
        let cv = new ConVar()
        Object.assign(cv, <ConVar>{operativo: varFound.operativo, tabla_datos: varFound.tabla_datos, variable:varFound.variable, texto:varFound.nombre });
        cv.relacion = relation? relation.tiene: undefined;
        return cv
    }
    buildExpresionVar(): string {
        return this.relacion? <string>this.relacion + '.' + this.variable : this.variable;
    }
    static async fetchAll(client: Client, op: string): Promise<ConVar[]> {
        let result = await client.query(`SELECT * FROM con_var c WHERE c.operativo = $1`, [op]).fetchAll();
        return (<ConVar[]>result.rows).map((cv: ConVar) => Object.setPrototypeOf(cv, ConVar.prototype));
    }
}
