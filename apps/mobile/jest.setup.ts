import { setLogSink } from './src/lib/logger';

setLogSink(() => {}); // keep test output clean; logger tests use their own sinks
