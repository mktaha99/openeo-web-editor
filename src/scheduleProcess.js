/**
 * The one shape a scheduled process may have: every run fills start_date and
 * end_date into load_collection's temporal_extent.
 * The backend enforces the same rules (app/engine/utils/schedule_process.py and
 * date_rules.py), this module lets the Schedule form explain and fix problems before saving.
 */

export const START = 'start_date';
export const END = 'end_date';
export const DATE_PARAMS = [START, END];

const DATE_RULE = /^(today|start_of_month|start_of_year)(\s*[+-]\s*\d+\s*[dMy])?$/;
const FIXED_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a date rule like "today - 30d" or "start_of_month - 1M", or a real date like "2024-01-01".
 */
export function isValidDate(text) {
	if (DATE_RULE.test(text)) {
		return true;
	}
	if (!FIXED_DATE.test(text)) {
		return false;
	}
	// rejects dates like 2024-02-30, which Date would roll over to March
	const date = new Date(`${text}T00:00:00Z`);
	return !isNaN(date) && date.toISOString().startsWith(text);
}

const DATE_SCHEMA = { type: 'string', subtype: 'date', format: 'date' };
const STANDARD_PARAMETERS = [
	{ name: START, description: 'Start of the period each run loads.', schema: DATE_SCHEMA },
	{ name: END, description: 'End of the period each run loads.', schema: DATE_SCHEMA }
];

function refName(value) {
	return value && typeof value === 'object' && !Array.isArray(value) ? value.from_parameter : undefined;
}

// every parameter name referenced anywhere in value, callbacks included
function referencedNames(value, names = new Set()) {
	if (Array.isArray(value)) {
		value.forEach(item => referencedNames(item, names));
	}
	else if (value && typeof value === 'object') {
		if (typeof value.from_parameter === 'string') {
			names.add(value.from_parameter);
		}
		Object.values(value).forEach(item => referencedNames(item, names));
	}
	return names;
}

function isStandardExtent(extent) {
	return Array.isArray(extent) && extent.length === 2 && refName(extent[0]) === START && refName(extent[1]) === END;
}

function describeExtent(nodeId, extent) {
	if (!Array.isArray(extent) || extent.length !== 2) {
		return `${nodeId} has no temporal extent.`;
	}
	const refs = extent.map(refName);
	if (refs[0] === END && refs[1] === START) {
		return `start_date and end_date are swapped in ${nodeId}.`;
	}
	if (refs.every(name => name === undefined)) {
		const show = v => (typeof v === 'string' ? v.substring(0, 10) : 'open');
		return `${nodeId} uses fixed dates: ${show(extent[0])} to ${show(extent[1])}.`;
	}
	return `${nodeId} uses ${refs.map((name, i) => name || (i === 0 ? 'a fixed start' : 'a fixed end')).join(' and ')} for its dates.`;
}

/**
 * Check a process against the standard.
 * Returns {ok: true} or {ok: false, problem: <message for the user>, fixable: <can standardize() fix it>}.
 */
export function inspect(process) {
	const graph = (process && process.process_graph) || {};
	const loads = Object.keys(graph).filter(id => graph[id].process_id === 'load_collection');
	const others = ((process && process.parameters) || []).map(p => p.name).filter(name => !DATE_PARAMS.includes(name));
	const watched = new Set([...DATE_PARAMS, ...others]);

	// where are the date parameters (and the ones they would replace) used, apart from load_collection's temporal_extent?
	const misuse = [];
	for (const [id, node] of Object.entries(graph)) {
		const args = Object.assign({}, node.arguments);
		if (node.process_id === 'load_collection') {
			delete args.temporal_extent;
		}
		const used = [...referencedNames(args)].filter(name => watched.has(name));
		if (used.length > 0) {
			misuse.push(`${used.join(' and ')} in ${id}`);
		}
	}
	if (misuse.length > 0) {
		return { ok: false, fixable: false, problem: `Schedules only fill dates into load_collection's temporal_extent, but this process also uses ${misuse.join(', ')}. Change this in the Visual Model.` };
	}

	if (loads.length === 0) {
		return { ok: false, fixable: false, problem: 'This process has no load_collection, so there are no dates to schedule.' };
	}
	const unwired = loads.filter(id => !isStandardExtent(graph[id].arguments.temporal_extent));
	if (loads.length > 1 && unwired.length > 0) {
		return { ok: false, fixable: false, problem: `This process loads data in ${loads.join(', ')}. Connect start_date and end_date to the temporal_extent of each one in the Visual Model.` };
	}
	if (unwired.length > 0) {
		const id = unwired[0];
		return { ok: false, fixable: true, problem: describeExtent(id, graph[id].arguments.temporal_extent) };
	}
	if (others.length > 0) {
		return { ok: false, fixable: true, problem: `Schedules only use start_date and end_date, not ${others.join(', ')}.` };
	}
	return { ok: true };
}

/**
 * Wire start_date and end_date into the single load_collection and declare them.
 * Only call this when inspect() says the process is fixable.
 * Returns {process, values}: a new process, and the dates to start the form with,
 * taken from the old fixed dates or from the values of the parameters they replace.
 */
export function standardize(process, oldValues = {}) {
	const result = JSON.parse(JSON.stringify(process));
	const defaults = Object.fromEntries((result.parameters || []).filter(p => 'default' in p).map(p => [p.name, p.default]));
	const known = Object.assign(defaults, oldValues);
	const values = { [START]: '', [END]: '' };

	const node = Object.values(result.process_graph).find(n => n.process_id === 'load_collection');
	const extent = node.arguments.temporal_extent;
	if (Array.isArray(extent) && extent.length === 2) {
		extent.forEach((item, i) => {
			const name = refName(item);
			// match old names like "Start_data" or "end" by meaning, so swapped wiring keeps the user's intent
			let target = i === 0 ? START : END;
			if (name && /start/i.test(name)) {
				target = START;
			}
			else if (name && /end/i.test(name)) {
				target = END;
			}
			const value = name ? known[name] : item;
			if (typeof value === 'string' && value.trim() !== '') {
				values[target] = name ? value.trim() : value.substring(0, 10);
			}
		});
	}

	node.arguments.temporal_extent = [{ from_parameter: START }, { from_parameter: END }];
	result.parameters = JSON.parse(JSON.stringify(STANDARD_PARAMETERS));
	return { process: result, values };
}
