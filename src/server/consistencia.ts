import * as EP from "expre-parser";
import { ConCompiler } from "./con-compiler";
import { IExpressionContainer, Relacion, TablaDatos, Client, quoteIdent, quoteLiteral, quoteNullable, ConVar } from "./types-consistencias";

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

// async function fetchAllPrueba<ModelClass>(tableName:string, op:string, client:Client){
//     let result = await client.query(`SELECT * FROM ${tableName} c WHERE c.operativo = $1`, [op]).fetchAll();
//     return (<ModelClass[]>result.rows).map((jsonobj: ModelClass) => Object.setPrototypeOf(jsonobj, (ModelClass).prototype));
// }
// fetchAllPrueba<Consistencia>('consistencia', 'asdf', <Client>{})

export class Consistencia implements ConsistenciaDB, IExpressionContainer{
    // @ts-ignore https://github.com/codenautas/operativos/issues/4
    operativo: string
    // @ts-ignore https://github.com/codenautas/operativos/issues/4    
    consistencia: string
    precondicion?: string
    // @ts-ignore https://github.com/codenautas/operativos/issues/4
    postcondicion: string
    // @ts-ignore https://github.com/codenautas/operativos/issues/4
    activa: boolean
    campos_pk?: string // se guardan las pks (con alias) de los TDs involucrados en los insumos
    error_compilacion?: string
    clausula_from?:string
    clausula_where?:string
    valida?: boolean
    explicacion?: string
    falsos_positivos?: boolean
    momento?: string
    tipo?: string
    modulo?: string
    observaciones?: string
    variables_de_contexto?: string
    compilada?: Date

    insumosConVars:ConVar[] = [];

    // complexExp:complexExpression
    tdsNeedByExpression: string[]= [];

    expressionProcesada: string = '';
    insumos!: EP.Insumos; 
    
    orderedInsumosTDNames: string[] = []
    insumosOptionalRelations: Relacion[] = []
    lastTD!:TablaDatos

    static async fetchOne(client: Client, op: string, con: string): Promise<Consistencia> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1 AND c.consistencia = $2`, [op, con]).fetchUniqueRow();
        // Using assign instead of setPrototypeOf because we need to have initialized properties
        return Object.assign(new Consistencia, result.row)
    }

    static async fetchAll(client: Client, op: string): Promise<Consistencia[]> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1`, [op]).fetchAll();
        // Using assign instead of setPrototypeOf because we need to have initialized properties
        return (<Consistencia[]>result.rows).map((con: Consistencia) => Object.assign(new Consistencia, con));
    }    
    prepare(){
        this.cleanAll();
    }

    compilationFails(error:Error): void {
        // TODO catch solo errores de pg EP o nuestros, no de mala programación
        this.cleanAll(); //compilation fails then removes all generated data in validateAndPreBuild
        this.error_compilacion = (<Error>error).message;
        throw new Error(this.error_compilacion + this.msgErrorCompilación());
    }  

    fusionUserExpressions():void {
        this.expressionProcesada = '(' + (this.precondicion || 'true') + ') AND (' + this.postcondicion + ')';
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
        this.compilada = this.error_compilacion = undefined;
        this.campos_pk = this.clausula_from = this.clausula_where = undefined;

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
            ${this.insumosConVars.map(cv => `($1, $2,${quoteLiteral(cv.buildExpresionVar())},${quoteLiteral(cv.tabla_datos)},${quoteLiteral(cv.variable)},${quoteNullable(cv.relacion?cv.relacion:null)},${quoteNullable(cv.texto?cv.texto:null)})`).join(', ')}`;
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

    // correr() {
    //     if (!this.valida) {
    //         throw new Error('La consistencia ' + this.consistencia + ' debe haber compilado exitosamente');
    //     }
    // }

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
        //TODO: se está usando ConCompiler.instanceObj en lugar de this.opGen, mejorar
        let jsonbValueAlias = conVar.relacion? conVar.relacion: ConCompiler.instanceObj.getUniqueTD(conVar.tabla_datos).getTableName();
        return `${jsonbPropertyKey},${quoteIdent(jsonbValueAlias)}.${quoteIdent(conVar.variable)}`;
    }

    private getPkIntegrada(): string {
        return `jsonb_build_object(
          ${(<string>this.campos_pk).split(',').map(campoConAlias => Consistencia.pkIntegradaElement(campoConAlias)).join(',')}
        ) as pk_integrada`;
    }

    private static pkIntegradaElement(campoConAlias: string) {
        let [alias, field] = campoConAlias.split('.');
        return `${quoteLiteral(field)}, ${quoteIdent(alias)}.${quoteIdent(field)}`
    }
    setClausulaWhere() {
        this.clausula_where = `WHERE ${this.expressionProcesada} IS NOT TRUE`;
        this.salvarFuncionInformado();
    }
    private salvarFuncionInformado() {
        //TODO: sacar esto de acá
        var regex = /\binformado\(null2zero\(([^()]+)\)\)/gi
        function regexFunc(_x: string, centro: string) {
            return 'informado(' + centro + ')';
        }
        this.clausula_where = (<string>this.clausula_where).replace(regex, regexFunc);

    }
}