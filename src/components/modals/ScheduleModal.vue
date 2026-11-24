<template>
	<Modal width="50%" :title="schedule ? 'Edit Schedule' : 'New Schedule'" @closed="$emit('closed')" :submitFunction="submit" :submitButtonText="schedule ? 'Save' : 'Create'">
		<div class="schedule-form">
			<label>Title</label>
			<input v-model="title" placeholder="Monthly AETI summary" />

			<label>Repeat</label>
			<div class="cron-presets">
				<button v-for="p in presets" :key="p.cron" type="button" :class="{active: cron === p.cron}" @click="cron = p.cron">{{ p.label }}</button>
			</div>
			<div class="cron-row">
				<input v-model="cron" placeholder="0 6 * * 0" title="Cron expression (minute hour day month weekday), in UTC" />
				<span class="hint">{{ cronText }}</span>
			</div>

			<label>Dates</label>
			<div v-if="!check.ok" class="date-setup">
				<p>
					Scheduled runs load data from <code>start_date</code> to <code>end_date</code>, connected to the temporal extent of <code>load_collection</code>.
					{{ check.problem }}
				</p>
				<button v-if="check.fixable" type="button" @click="useStandardDates">
					<i class="fas fa-magic"></i> Use start/end dates
				</button>
			</div>
			<div v-else class="params">
				<div v-for="p in params" :key="p.name" class="param-row">
					<span class="param-name" :title="p.name">{{ labels[p.name] || p.name }}</span>
					<!-- one box per date: a dropdown, which turns into a text box for any other date or rule -->
					<select v-if="!p.custom" :value="p.value" @change="pickDate(p, $event.target.value)">
						<option value="" disabled>Choose…</option>
						<option v-for="o in dateOptions[p.name] || []" :key="o.value" :value="o.value">{{ o.label }}</option>
						<option :value="CUSTOM">Custom date or rule…</option>
					</select>
					<template v-else>
						<input v-model="p.value" :ref="`custom-${p.name}`" placeholder="e.g. 2024-01-01 or today - 11d" />
						<button type="button" class="to-list" title="Back to the list" @click="useList(p)"><i class="fas fa-list"></i></button>
					</template>
					<span v-if="!isValid(p)" class="hint date-error">✕ not a valid date</span>
				</div>
				<p class="hint">Each run loads data from the start date to the end date, worked out on the day it runs.</p>
				<table v-if="params.some(p => p.custom)" class="hint date-rules">
					<tr><th colspan="2">Write a custom date as</th></tr>
					<tr><td><code>2024-01-01</code></td><td>a fixed date (YYYY-MM-DD), the same on every run</td></tr>
					<tr><td><code>today</code></td><td>the day of the run</td></tr>
					<tr><td><code>start_of_month</code></td><td>the 1st of the run's month</td></tr>
					<tr><td><code>start_of_year</code></td><td>1 January of the run's year</td></tr>
					<tr><th colspan="2">Add or subtract days <code>d</code>, months <code>M</code> or years <code>y</code></th></tr>
					<tr><td><code>today - 11d</code></td><td>11 days before the run</td></tr>
					<tr><td><code>start_of_month - 1M</code></td><td>the 1st of last month</td></tr>
					<tr><td><code>start_of_month - 1d</code></td><td>the last day of last month</td></tr>
					<tr><td><code>start_of_year + 6M</code></td><td>1 July of the run's year</td></tr>
				</table>
			</div>

			<div class="process-row">
				<span class="hint">Process: {{ nodeCount }} steps</span>
				<button v-if="schedule && hasProcess" type="button" @click="useEditorProcess" title="Replace this schedule's process with the one in the Visual Model">
					<i class="fas fa-project-diagram"></i> Use process from Visual Model
				</button>
			</div>
			<details class="advanced">
				<summary>Process (JSON)</summary>
				<textarea v-model="processJson" rows="10" />
			</details>

			<div v-if="error" class="message error">{{ error }}</div>
		</div>
	</Modal>
</template>

<script>
import Modal from './Modal.vue';
import Utils from '../../utils.js';
import { inspect, standardize, isValidDate, START, END, DATE_PARAMS } from '../../scheduleProcess.js';

const PRESETS = [
	{ label: 'Every day', cron: '0 3 * * *' },
	{ label: 'Every Sunday', cron: '0 6 * * 0' },
	{ label: '1st of month', cron: '0 0 1 * *' },
];

// common choices for the date dropdowns; each one is saved as its rule
const DATE_OPTIONS = {
	[START]: [
		{ label: 'Yesterday', value: 'today - 1d' },
		{ label: '7 days ago', value: 'today - 7d' },
		{ label: '30 days ago', value: 'today - 30d' },
		{ label: '3 months ago', value: 'today - 3M' },
		{ label: '1 year ago', value: 'today - 1y' },
		{ label: 'Start of this month', value: 'start_of_month' },
		{ label: 'Start of last month', value: 'start_of_month - 1M' },
		{ label: 'Start of this year', value: 'start_of_year' },
		{ label: 'Start of last year', value: 'start_of_year - 1y' }
	],
	[END]: [
		{ label: 'Today', value: 'today' },
		{ label: 'Yesterday', value: 'today - 1d' },
		{ label: 'End of last month', value: 'start_of_month - 1d' },
		{ label: 'End of last year', value: 'start_of_year - 1d' }
	]
};
const CUSTOM = 'custom';

export default {
	name: 'ScheduleModal',
	components: {
		Modal
	},
	props: {
		// openEO process ({parameters, process_graph}) to schedule
		process: {
			type: Object,
			required: true
		},
		// existing schedule when editing
		schedule: {
			type: Object,
			default: null
		},
		defaultTitle: {
			type: String,
			default: ''
		}
	},
	data() {
		const values = this.schedule ? this.schedule.parameters : {};
		return {
			presets: PRESETS,
			labels: { [START]: 'Start date', [END]: 'End date' },
			dateOptions: DATE_OPTIONS,
			CUSTOM,
			title: this.schedule ? (this.schedule.title || '') : this.defaultTitle,
			cron: this.schedule ? this.schedule.cron : '0 6 * * 0',
			processJson: JSON.stringify(this.process, null, 2),
			params: this.toParamRows(values),
			error: null
		};
	},
	computed: {
		...Utils.mapGetters('editor', ['hasProcess']),
		cronText() {
			return Utils.cronToHuman(this.cron) || '';
		},
		check() {
			try {
				return inspect(JSON.parse(this.processJson));
			} catch {
				return { ok: false, fixable: false, problem: 'The process JSON is not valid.' };
			}
		},
		nodeCount() {
			try {
				return Object.keys(JSON.parse(this.processJson).process_graph || {}).length;
			} catch {
				return '?';
			}
		}
	},
	methods: {
		// every schedule has the same two dates, whatever the process declares
		toParamRows(values) {
			return DATE_PARAMS.map(name => {
				const value = name in values ? this.toText(values[name]) : '';
				const option = this.optionFor(name, value);
				return {
					name,
					value: option ? option.value : value,
					// dates and rules that aren't in the list open in the text box
					custom: !option && value.trim() !== ''
				};
			});
		},
		optionFor(name, value) {
			// "today-30d" and "today - 30d" are the same rule
			const squash = text => text.replace(/\s+/g, '');
			return (DATE_OPTIONS[name] || []).find(o => squash(o.value) === squash(value));
		},
		pickDate(p, choice) {
			if (choice !== CUSTOM) {
				p.value = choice;
				return;
			}
			// the text box starts with the current choice's rule, so it can be edited from there
			p.custom = true;
			this.$nextTick(() => {
				const [input] = this.$refs[`custom-${p.name}`] || [];
				if (input) {
					input.focus();
				}
			});
		},
		useList(p) {
			const option = this.optionFor(p.name, p.value);
			p.value = option ? option.value : '';
			p.custom = false;
		},
		useEditorProcess() {
			this.processJson = JSON.stringify(this.$store.state.editor.process, null, 2);
			Utils.ok(this, 'Process taken from the Visual Model. Click Save to keep it.');
		},
		useStandardDates() {
			// keep what the user already had, so old fixed dates or parameter values carry over
			const oldValues = Object.assign({}, this.schedule ? this.schedule.parameters : {}, this.filledParameters());
			const { process, values } = standardize(JSON.parse(this.processJson), oldValues);
			this.params = this.toParamRows(values);
			this.processJson = JSON.stringify(process, null, 2);
		},
		toText(value) {
			return typeof value === 'string' ? value : JSON.stringify(value);
		},
		isValid(p) {
			const text = p.value.trim();
			return text === '' || isValidDate(text);
		},
		filledParameters() {
			return Object.fromEntries(
				this.params
					.filter(p => p.value.trim() !== '')
					.map(p => [p.name, p.value.trim()])
			);
		},
		async submit() {
			this.error = null;
			if (!this.check.ok) {
				this.error = this.check.fixable ? `${this.check.problem} Click "Use start/end dates" first.` : this.check.problem;
				return;
			}
			const label = p => this.labels[p.name] || p.name;
			const empty = this.params.filter(p => p.value.trim() === '').map(label);
			if (empty.length > 0) {
				this.error = `Choose a date for: ${empty.join(', ')}`;
				return;
			}
			const invalid = this.params.filter(p => !this.isValid(p)).map(label);
			if (invalid.length > 0) {
				this.error = `Not valid dates: ${invalid.join(', ')}`;
				return;
			}
			let process;
			try {
				process = JSON.parse(this.processJson);
			} catch {
				this.error = 'The process JSON is not valid.';
				return;
			}
			const data = {
				title: this.title || null,
				cron: this.cron.trim(),
				process,
				parameters: this.filledParameters()
			};
			try {
				if (this.schedule) {
					await this.$store.dispatch('schedules/update', { id: this.schedule.id, data });
					Utils.ok(this, 'Schedule saved');
				}
				else {
					const created = await this.$store.dispatch('schedules/create', data);
					Utils.ok(this, `Schedule created. First run: ${Utils.formatTimestamp(created.next_run_at)}`);
				}
				this.$emit('closed');
			} catch (e) {
				this.error = e.response?.data?.message || e.message;
			}
		}
	}
};
</script>

<style scoped>
.schedule-form label { display: block; margin-top: 12px; font-weight: bold; }
.schedule-form input, .schedule-form textarea { width: 100%; box-sizing: border-box; padding: 4px 6px; }
.schedule-form textarea { font-family: monospace; font-size: 0.85em; }
.cron-presets { display: flex; gap: 4px; margin: 4px 0; }
.cron-presets button.active { font-weight: bold; }
.cron-row, .param-row { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.cron-row input { width: 12em; font-family: monospace; }
.param-name { min-width: 8em; }
/* the dropdown and the text box take the same space, so switching doesn't move anything */
.param-row select, .param-row input { flex: 1; min-width: 0; padding: 4px 6px; }
.param-row input { font-family: monospace; }
.date-error { color: #dc3545; }
.date-rules { border-collapse: collapse; margin-top: 2px; }
.date-rules th { text-align: left; font-weight: normal; padding: 6px 0 2px 0; }
.date-rules td { padding: 1px 12px 1px 0; vertical-align: top; }
.date-rules td:first-child { white-space: nowrap; }
.date-setup { margin-top: 4px; padding: 8px 10px; border-left: 4px solid #f0ad4e; background: #fcf8e3; }
.date-setup p { margin: 0 0 6px 0; }
.hint { color: #666; font-size: 0.85em; }
.process-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
.advanced { margin-top: 4px; }
.advanced summary { cursor: pointer; }
.message.error { margin-top: 8px; }
</style>
