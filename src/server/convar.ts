import { Client } from 'pg-promise-strict';

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
    buildExpresionVar(): string {
        return this.relacion? this.relacion + '.' + this.variable : this.variable;
    }
    static async fetchAll(client: Client, op: string): Promise<ConVar[]> {
        let result = await client.query(`SELECT * FROM con_var c WHERE c.operativo = $1`, [op]).fetchAll();
        return <ConVar[]>result.rows.map((cv: ConVar) => Object.setPrototypeOf(cv, ConVar.prototype));
    }
}
