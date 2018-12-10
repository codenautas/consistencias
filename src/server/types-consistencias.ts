import * as EP from "expre-parser";
import { Client, quoteIdent, quoteLiteral, quoteNullable } from 'pg-promise-strict';
import { addAliasesToExpression, compilerOptions, getWrappedExpression, hasAlias, OperativoGenerator, TablaDatos, Variable, Relacion } from 'varcal';

export * from 'varcal';

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

export abstract class ConsistenciaDB {
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

export class Consistencia extends ConsistenciaDB {
    static mainTD: string;
    static orderedIngresoTDNames: string[];
    static orderedReferencialesTDNames: string[];
    
    insumosConVars: ConVar[];
    client: Client;
    condInsumos: EP.Insumos;
    opGen: OperativoGenerator;
    validVars: Variable[];
    optionalRelations: Relacion[];

    static async fetchOne(client: Client, op: string, con: string): Promise<Consistencia> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1 AND c.consistencia = $2`, [op, con]).fetchUniqueRow();
        return Object.assign(new Consistencia(), result.row);
    }

    static async fetchAll(client: Client, op: string): Promise<Consistencia[]> {
        let result = await client.query(`SELECT * FROM consistencias c WHERE c.operativo = $1`, [op]).fetchAll();
        return <Consistencia[]>result.rows.map((con: Consistencia) => Object.setPrototypeOf(con, Consistencia.prototype));
    }

    private async validateAndPreBuild(): Promise<void> {
        this.validatePreAndPostCond();
        this.validateCondInsumos();
        await this.validateCondInDBMS();
        // pass all validations then complete this consistence to save afterwards
        this.compilada = new Date();
        this.valida = true;
    }

    private validatePreAndPostCond(): any {
        // valida o "sanitiza" la pre cond
        if (this.precondicion) {
            EP.parse(this.precondicion)
        } else {
            this.precondicion = 'true'
        }
        EP.parse(this.postcondicion)
    }

    //chequear que la expresiones (pre y post) sea correcta (corriendo un select simple para ver si falla postgres) 
    private async validateCondInDBMS() {
        this.buildSQLFromExpresions();
        await this.testBuiltSQL();
    }
    
    private buildSQLFromExpresions() {
        // TODO: ORDENAR dinamicamente:
        // primero: la td que no tenga ninguna TD en que busco es la principal
        // segundas: van todas las tds que tengan en "que_busco" a la principal
        // terceras: las tds que tengan en "que busco" a las segundas
        // provisoriamente se ordena fijando un arreglo ordenado
        // TODO: deshardcodear main TD
        let insumosAliases: string[] = this.getInsumosAliases();
        let orderedInsumosIngresoTDNames: string[] = Consistencia.orderedIngresoTDNames.filter(orderedTDName => insumosAliases.indexOf(orderedTDName) > -1);
        let orderedInsumosReferencialesTDNames: string[] = Consistencia.orderedReferencialesTDNames.filter(orderedTDName => insumosAliases.indexOf(orderedTDName) > -1);
        let NOTOrderedInsumosOptionalRelations: Relacion[] = this.optionalRelations.filter(r => insumosAliases.indexOf(r.que_busco) > -1);
        
        let orderedInsumosTDNames = orderedInsumosIngresoTDNames.concat(orderedInsumosReferencialesTDNames);
        let lastTD = this.opGen.getUniqueTD(orderedInsumosIngresoTDNames[orderedInsumosIngresoTDNames.length - 1]); //tabla mas específicas (hija)
        //calculo de campos_pk
        // TODO: agregar validación de funciones de agregación, esto es: si la consistencia referencia variables de tablas mas específicas (personas)
        // pero lo hace solo con funciones de agregación, entonces, los campos pk son solo de la tabla mas general, y no de la específica
        // TODO: separar internas de sus calculadas y que el último TD se tome de las internas 
        this.campos_pk = lastTD.getPKsWitAlias().join(',');
        this.buildClausulaFrom(orderedInsumosTDNames, NOTOrderedInsumosOptionalRelations);
        this.buildClausulaWhere(lastTD);
    }

    private async testBuiltSQL() {
        // TODO: deshardcodear id_caso de todos lados y operativo también! Pero después
        let selectQuery = `
            SELECT ${this.getCompleteClausule(this.insumosConVars)}
                  AND ${quoteIdent(Consistencia.mainTD)}.operativo=${quoteLiteral(this.operativo)}
                  AND ${quoteIdent(Consistencia.mainTD)}.id_caso='-1'`;
        var result = await this.client.query('select try_sql($1) as error_informado', [selectQuery]).fetchOneRowIfExists();
        if(result.row.error_informado){
            throw new Error(result.row.error_informado);
        }
    }

    private getInsumosAliases() {
        let insumosAliases: string[] = this.insumosConVars.map(cv => cv.relacion || cv.tabla_datos);
        insumosAliases = insumosAliases.filter((elem, index, self) => index === self.indexOf(elem)); //remove duplicated
        if (insumosAliases.indexOf(Consistencia.mainTD) == -1) {
            insumosAliases.push(Consistencia.mainTD);
        }
        return insumosAliases;
    }

    private buildClausulaWhere(lastTD: TablaDatos) {
        this.precondicion = getWrappedExpression(this.precondicion, lastTD.getQuotedPKsCSV(), compilerOptions);
        this.postcondicion = getWrappedExpression(this.postcondicion, lastTD.getQuotedPKsCSV(), compilerOptions);
        this.precondicion = addAliasesToExpression(this.precondicion, EP.parse(this.precondicion).getInsumos(), this.opGen.myVars, this.opGen.myTDs);
        this.postcondicion = addAliasesToExpression(this.postcondicion, EP.parse(this.postcondicion).getInsumos(), this.opGen.myVars, this.opGen.myTDs);
        this.clausula_where = `WHERE ${this.getMixConditions()} IS NOT TRUE`;

        //TODO: hacer esto dinámico
        this.salvarFuncionInformado();
    }

    private buildClausulaFrom(orderedInsumosTDNames: string[], NOTOrderedInsumosOptionalRelations: Relacion[]) {
        let firstTD = this.opGen.getUniqueTD(orderedInsumosTDNames[0]); //tabla mas general (padre)
        this.clausula_from = 'FROM ' + quoteIdent(firstTD.getTableName());
        for (let i = 1; i < orderedInsumosTDNames.length; i++) {
            let leftInsumoAlias = orderedInsumosTDNames[i - 1];
            let rightInsumoAlias = orderedInsumosTDNames[i];
            this.clausula_from += this.opGen.joinTDs(leftInsumoAlias, rightInsumoAlias);
        }

        //TODO: en el futuro habría que validar que participe del from la tabla de busqueda 
        NOTOrderedInsumosOptionalRelations.forEach(r=>this.clausula_from += this.opGen.joinRelation(r));
    }

    salvarFuncionInformado() {
        //TODO: sacar esto de acá
        var regex = /\binformado\(null2zero\(([^()]+)\)\)/gi
        function regexFunc(x: string, centro: string) {
            return 'informado(' + centro + ')';
        }
        this.clausula_where = this.clausula_where.replace(regex, regexFunc);

        // this.clausula_where = this.clausula_where.replace(new RegExp('\binformado\(null2zero\(([^()]+)\)\)', 'gi'), '$1' + replaceStr + '$3');
    }

    //TODO: unificar manejo de conVars e insumosVars desde el compilar y desde el consistir
    getCompleteClausule(conVars: ConVar[]): string {
        return `${this.getSelectFields(conVars)}
            ${this.clausula_from}
            ${this.clausula_where}`;
    }

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

    //TODO: ahora estamos usando en varios lados la función quoteLiteral exportada directamente del paquete pg-promise-strict, luego habría que usarla desde la app
    // porque en el futuro la app podría quotear distinto según la DB.
    private getPkIntegrada(): string {
        return `jsonb_build_object(
          ${this.campos_pk.split(',').map(campoConAlias => Consistencia.pkIntegradaElement(campoConAlias)).join(',')}
        ) as pk_integrada`;
    }

    private static pkIntegradaElement(campoConAlias: string) {
        let [alias, field] = campoConAlias.split('.');
        return `${quoteLiteral(field)}, ${quoteIdent(alias)}.${quoteIdent(field)}`
    }

    private getMixConditions() {
        return '(' + this.precondicion + ') AND (' + this.postcondicion + ')';
    }

    // chequear que todas las variables de la cond existan en alguna tabla (sino se llena el campo error_compilacion)
    private validateCondInsumos(): void {
        this.condInsumos = EP.parse(this.getMixConditions()).getInsumos();
        this.validateFunctions(this.condInsumos.funciones);
        this.validateVars(this.condInsumos.variables);
    }

    private msgErrorCompilación() {
        return ` La consistencia "${this.consistencia}" del operativo "${this.operativo}" es inválida.`;
    }

    private validateVars(varNames: string[]): void {
        this.validVars = this.opGen.myVars.filter(v => Consistencia.validTDNames().indexOf(v.tabla_datos) > -1);
        this.optionalRelations = this.opGen.myRels.filter(rel => rel.tipo == 'opcional');
        varNames.forEach(varName => {
            let conVar = new ConVar(); // supongo que voy a encontrar una sola variable y válida
            let varsFound: Variable[] = this.findValidVars(varName, conVar);
            
            if (varsFound.length > 1) {
                throw new Error('La variable "' + varName + '" se encontró mas de una vez en las siguientes tablas de datos: ' + varsFound.map(v => v.tabla_datos).join(', '));
            }
            if (varsFound.length <= 0) {
                throw new Error('La variable "' + varName + '" no se encontró en la lista de variables.');
            }

            let varFound = varsFound[0];
            if (!varFound.activa) { throw new Error('La variable "' + varName + '" no está activa.'); }

            //lleno el resto de la variable a con_var
            Object.assign(conVar, <ConVar>{operativo: varFound.operativo, tabla_datos: varFound.tabla_datos, variable:varFound.variable, texto:varFound.nombre });
            this.insumosConVars.push(conVar);
        });
    }

    private findValidVars(varName: string, conVar: ConVar) {
        let rawVarName = varName;
        let varsFound:Variable[] = this.validVars;
        if (hasAlias(varName)) {
            let varAlias = varName.split('.')[0];
            rawVarName = varName.split('.')[1];

            let validRelationsNames = this.optionalRelations.map(rel=>rel.que_busco)

            let validAliases = Consistencia.validTDNames().concat(validRelationsNames);
            if (validAliases.indexOf(varAlias) == -1) {
                throw new Error('El alias "' + varAlias + '" no se encontró en la lista de alias válidos: ' + validAliases.join(', '));
            }
            let tdName = varAlias;
            if (validRelationsNames.indexOf(varAlias) > -1) {
                conVar.relacion = varAlias;
                tdName = this.optionalRelations.find(rel => rel.que_busco == varAlias).tabla_busqueda;
            }
            varsFound = varsFound.filter(v => v.tabla_datos == tdName);
        }
        return varsFound.filter(v => v.variable == rawVarName);
    }

    private validateFunctions(funcNames: string[]) {
        let pgWitheList = ['div', 'avg', 'count', 'max', 'min', 'sum', 'coalesce'];
        let comunSquemaWhiteList = ['informado'];
        let functionWhiteList = pgWitheList.concat(comunSquemaWhiteList);
        funcNames.forEach(f => {
            if (hasAlias(f)) {
                if (f.split('.')[0] != 'dbo') {
                    throw new Error('La Función ' + f + ' contiene un alias inválido');
                }
            } else {
                if (functionWhiteList.indexOf(f) == -1) {
                    throw new Error('La Función ' + f + ' no está incluida en la whiteList de funciones: ' + functionWhiteList.toString());
                }
            }
        })
    }

    // responsabilidades: chequear que sea valida y generar el sql 
    async compilar(client: Client) {
        //TODO: cambiar el aproach, que el compilador de consistencias sepa como compilar una y no la misma consistencia...
        this.client = client;
        this.opGen = OperativoGenerator.instanceObj;

        //TODO: cuando se compile en masa sacar este fetchall a una clase Compilador que lo haga una sola vez
        try {
            this.cleanAll();
            await this.validateAndPreBuild();
            // await this.updateDB(); //TODO: se pone acá provisoriamente hasta corregir el tema del guardado del error
            //await this.correr();
        } catch (error) {
            // TODO catch solo errores de pg EP o nuestros, no de mala programación
            this.cleanAll(); //compilation fails then removes all generated data in validateAndPreBuild
            this.error_compilacion = (<Error>error).message;
            throw new Error(this.error_compilacion + this.msgErrorCompilación());
        }
        finally {
            await this.updateDB();
        }
    }
    static validTDNames(): any {
        return Consistencia.orderedIngresoTDNames.concat(Consistencia.orderedReferencialesTDNames);
    }

    private cleanAll() {
        // clean consistencia
        this.valida = false;
        this.compilada = null;
        this.clausula_from = this.clausula_where = this.campos_pk = this.error_compilacion = null;

        // clean con vars to insert
        this.insumosConVars = [];
    }

    // TODO hacer distintos executes() ya que el procedure de BEPlus asegura que dentro del mismo coreFunction
    // todos los context.client.query.execute() van dentro de la misma transacción (transacción que se abre al iniciar el core function
    // y queda abierta hasta que termina) que rollbaquea todos los execute si algo va mal, además se espera que conectarse varias veces
    // a la DB (hacer distintos executes()) no sea un problema futuro de performance (ya sea porque node y postgres estarán en el 
    // mismo server o bien conectados por fibra). Además como la transacción queda abierta luego del primer execute(), en los consecutivos execute()
    // "se ahorra" bastante overhead de levantar una nueva transacción. Esto es: un motivo mas para no hacer una query choclaso.
    // Entonces haciendo execute diferentes se podrá organizar el código mas modularmente, usar query params y no necesitar poner
    // do begin end.
    private async updateDB(): Promise<any> {
        let basicParams = [this.operativo, this.consistencia];
        //delete con_var
        await this.client.query('DELETE FROM con_var WHERE operativo=$1 AND consistencia=$2', basicParams).execute();

        // insert con_vars
        if (this.insumosConVars.length > 0) {
            let conVarInsertsQuery = `INSERT INTO con_var (operativo, consistencia, expresion_var, tabla_datos, variable, relacion, texto) VALUES 
            ${this.insumosConVars.map(cv => `($1, $2,${quoteLiteral(cv.buildExpresionVar())},${quoteLiteral(cv.tabla_datos)},${quoteLiteral(cv.variable)},${quoteNullable(cv.relacion)},${quoteNullable(cv.texto)})`).join(', ')}`;
            await this.client.query(conVarInsertsQuery, basicParams).execute();
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
        await this.client.query(conUpdateQuery, params).execute();
    }

    correr() {
        if (!this.valida) {
            throw new Error('La consistencia ' + this.consistencia + ' debe haber compilado exitosamente');
        }
    }
}

export class ConsistenciasGenerator extends OperativoGenerator {
    myCons: Consistencia[]

    constructor(operativo: string) {
        super(operativo);
    }

    async fetchDataFromDB(client: Client) {
        await super.fetchDataFromDB(client);
        this.myCons = await Consistencia.fetchAll(client, this.operativo);
    }

}