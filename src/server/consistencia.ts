import { Client, quoteIdent, quoteLiteral, quoteNullable } from 'pg-promise-strict';
import { OperativoGenerator} from "varcal";
import { ConVar } from "./types-consistencias";

export interface ConsistenciaDB {
    operativo: string
    consistencia: string
    precondicion?: string
    postcondicion: string
    activa: boolean
    clausula_from?: string
    clausula_where?: string
    campos_pk?: string // se guardan las pks (con alias) de los TDs involucrados en los insumos
    error_compilacion?: string
    valida?: boolean
    explicacion?: string
    falsos_positivos?: boolean
    momento?: string
    tipo?: string
    modulo?: string
    observaciones?: string
    variables_de_contexto?: string
    compilada?: Date
}

export class Consistencia extends ExpressionContainer implements ConsistenciaDB{
    operativo: string
    consistencia: string
    precondicion?: string
    postcondicion: string
    activa: boolean
    campos_pk?: string // se guardan las pks (con alias) de los TDs involucrados en los insumos
    error_compilacion?: string
    valida?: boolean
    explicacion?: string
    falsos_positivos?: boolean
    momento?: string
    tipo?: string
    modulo?: string
    observaciones?: string
    variables_de_contexto?: string
    compilada?: Date

    insumosConVars:ConVar[];

    static async fetchOne(client: Client, op: string, con: string): Promise<Consistencia> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1 AND c.consistencia = $2`, [op, con]).fetchUniqueRow();
        return Object.assign(new Consistencia(), result.row);
    }
    
    static async fetchAll(client: Client, op: string): Promise<Consistencia[]> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1`, [op]).fetchAll();
        return <Consistencia[]>result.rows.map((con: Consistencia) => Object.setPrototypeOf(con, Consistencia.prototype));
    }
    
    prepare(){
        this.cleanAll();
        this.precondicion = this.precondicion || 'true';
        
        super.prepare();
    }

    compilationFails(error:Error): void {
        // TODO catch solo errores de pg EP o nuestros, no de mala programación
        this.cleanAll(); //compilation fails then removes all generated data in validateAndPreBuild
        this.error_compilacion = (<Error>error).message;
        throw new Error(this.error_compilacion + this.msgErrorCompilación());
    }  

    getExpression():string {
        return '(' + this.precondicion + ') AND (' + this.postcondicion + ')';
    }

    private msgErrorCompilación() {
        return ` La consistencia "${this.consistencia}" del operativo "${this.operativo}" es inválida.`;
    }    

    markAsValid(): void {
        // pass all validations then complete this consistence to save afterwards
        this.compilada = new Date();
        this.valida = true;
    }

    private cleanAll() {
        // clean consistencia
        this.valida = false;
        this.compilada = null;
        this.clausula_from = this.clausula_where = this.campos_pk = this.error_compilacion = null;

        // clean con vars to insert
        this.insumosConVars = [];
    }

    // Se hacen distintos executes() ya que el procedure de BEPlus asegura que dentro del mismo coreFunction
    // todos los context.client.query.execute() van dentro de la misma transacción (transacción que se abre al iniciar el core function
    // y queda abierta hasta que termina) que rollbaquea todos los execute si algo va mal, además se espera que conectarse varias veces
    // a la DB (hacer distintos executes()) no sea un problema futuro de performance (ya sea porque node y postgres estarán en el 
    // mismo server o bien conectados por fibra). Además como la transacción queda abierta luego del primer execute(), en los consecutivos execute()
    // "se ahorra" bastante overhead de levantar una nueva transacción. Esto es: un motivo mas para no hacer una query choclaso.
    // Entonces haciendo execute diferentes se podrá organizar el código mas modularmente, usar query params y no necesitar poner
    // do begin end.
    async updateDB(client:Client): Promise<any> {
        let basicParams = [this.operativo, this.consistencia];
        //delete con_var
        await client.query('DELETE FROM con_var WHERE operativo=$1 AND consistencia=$2', basicParams).execute();

        // insert con_vars
        if (this.insumosConVars.length > 0) {
            let conVarInsertsQuery = `INSERT INTO con_var (operativo, consistencia, expresion_var, tabla_datos, variable, relacion, texto) VALUES 
            ${this.insumosConVars.map(cv => `($1, $2,${quoteLiteral(cv.buildExpresionVar())},${quoteLiteral(cv.tabla_datos)},${quoteLiteral(cv.variable)},${quoteNullable(cv.relacion)},${quoteNullable(cv.texto)})`).join(', ')}`;
            await client.query(conVarInsertsQuery, basicParams).execute();
        }

        // update consistencias query
        let fieldsToUpdate = ['valida', 'campos_pk', 'clausula_from', 'clausula_where', 'error_compilacion'];
        let esto: any = this; //TODO: ver porque tuvimos que poner tipo any a 'be' para que no falle el map
        // en lugar de ='be[f]' usamos $i+3, el +3 es debido a que operativo=$1 y consistencia=$2
        let conUpdateQuery = `UPDATE consistencias SET 
            compilada=${this.compilada ? 'current_timestamp' : 'null'},
            ${fieldsToUpdate.map((fieldName, index) => `${quoteIdent(fieldName)}=$${index + 3}`).join(', ')}
            WHERE operativo=$1 AND consistencia=$2`;
        let params = basicParams.concat(fieldsToUpdate.map(f => esto[f]));
        await client.query(conUpdateQuery, params).execute();
    }

    correr() {
        if (!this.valida) {
            throw new Error('La consistencia ' + this.consistencia + ' debe haber compilado exitosamente');
        }
    }

    //TODO: unificar manejo de conVars e insumosVars desde el compilar y desde el consistir
    getCompleteQuery(conVars: ConVar[]): string {
        return `SELECT 
          ${this.getSelectFields(conVars)}
          ${this.clausula_from}
          ${this.clausula_where}`;
    }

    // TODO: check this functions to pass to ConCompiler (or VarCalculator)
    private getSelectFields(conVars: ConVar[]): string {
        return `${quoteLiteral(this.operativo)},
            ${quoteLiteral(this.consistencia)},
            ${this.getPkIntegrada()},
            ${this.getInConVars(conVars)}`;
    }

    private getInConVars(conVars: ConVar[]): string {
        return 'jsonb_build_object(' + conVars.map(conVar => this.getConVarJsonB(conVar)).join(',') + ') as incon_vars';
    }

    private getConVarJsonB(conVar: ConVar) {
        let jsonbPropertyKey = quoteLiteral((conVar.relacion? conVar.relacion: conVar.tabla_datos) + '.' + conVar.variable);
        //TODO: se está usando OperativoGenerator.instanceObj en lugar de this.opGen, mejorar
        let jsonbValueAlias = conVar.relacion? conVar.relacion: OperativoGenerator.instanceObj.getUniqueTD(conVar.tabla_datos).getTableName();
        return `${jsonbPropertyKey},${quoteIdent(jsonbValueAlias)}.${quoteIdent(conVar.variable)}`;
    }

    private getPkIntegrada(): string {
        return `jsonb_build_object(
          ${this.campos_pk.split(',').map(campoConAlias => Consistencia.pkIntegradaElement(campoConAlias)).join(',')}
        ) as pk_integrada`;
    }

    private static pkIntegradaElement(campoConAlias: string) {
        let [alias, field] = campoConAlias.split('.');
        return `${quoteLiteral(field)}, ${quoteIdent(alias)}.${quoteIdent(field)}`
    }
}