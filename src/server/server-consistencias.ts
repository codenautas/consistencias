"use strict";

import {emergeAppConsistencias} from "./app-consistencias"
import {emergeAppOperativos, AppBackend} from "operativos"

var AppConsistencias = emergeAppConsistencias(emergeAppOperativos(AppBackend));

new AppConsistencias().start();