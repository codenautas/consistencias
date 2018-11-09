"use strict";

import {emergeAppConsistencias} from "./app-consistencias"
import {emergeAppOperativos, emergeAppVarCal, AppBackend} from "varcal"

var AppConsistencias = emergeAppConsistencias(emergeAppVarCal(emergeAppOperativos(AppBackend)));

new AppConsistencias().start();