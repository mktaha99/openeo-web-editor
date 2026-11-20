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

			<label>Parameters</label>
			<p v-if="params.length === 0" class="hint">
				This process has no parameters, so every run is the same.
				To change dates per run, add parameters with the <i class="fas fa-parking"></i> button in the Visual Model and connect them.
			</p>
			<div v-else class="params">
				<div v-for="p in params" :key="p.name" class="param-row">
					<code class="param-name" :title="p.description">{{ p.name }}</code>
					<input v-model="p.value" :placeholder="p.optional ? 'optional, default: ' + JSON.stringify(p.default) : 'required, e.g. today - 30d'" />
					<span class="hint preview" :class="{error: preview.error}">{{ previewFor(p) }}</span>
				</div>
				<p class="hint">
					Dates: <code>today</code>, <code>start_of_month</code>, <code>start_of_year</code>, optionally with <code>+</code>/<code>-</code> days (<code>d</code>), months (<code>M</code>) or years (<code>y</code>), e.g. <code>start_of_month - 1M</code>.
					Numbers and lists can be typed as they are.
				</p>
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

const PRESETS = [
	{ label: 'Every day', cron: '0 3 * * *' },
	{ label: 'Every Sunday', cron: '0 6 * * 0' },
	{ label: '1st of month', cron: '0 0 1 * *' },
];

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
			title: this.schedule ? (this.schedule.title || '') : this.defaultTitle,
			cron: this.schedule ? this.schedule.cron : '0 6 * * 0',
			processJson: JSON.stringify(this.process, null, 2),
			params: this.toParamRows(this.process, values),
			preview: {},
			error: null
		};
	},
	computed: {
		...Utils.mapGetters('editor', ['hasProcess']),
		cronText() {
			return Utils.cronToHuman(this.cron) || '';
		},
		nodeCount() {
			try {
				return Object.keys(JSON.parse(this.processJson).process_graph || {}).length;
			} catch {
				return '?';
			}
		}
	},
	watch: {
		processJson(json) {
			// keep the parameter rows in sync when the JSON is edited by hand
			try {
				const values = Object.fromEntries(this.params.map(p => [p.name, p.value]));
				this.params = this.toParamRows(JSON.parse(json), values);
			} catch {
				// keep the old rows while the JSON is half-typed
			}
		},
		params: {
			deep: true,
			handler() {
				clearTimeout(this.previewTimer);
				this.previewTimer = setTimeout(this.updatePreview, 300);
			}
		}
	},
	mounted() {
		this.updatePreview();
	},
	beforeDestroy() {
		clearTimeout(this.previewTimer);
	},
	methods: {
		toParamRows(process, values) {
			return (process.parameters || []).map(p => ({
				name: p.name,
				description: p.description,
				optional: Boolean(p.optional),
				default: p.default,
				value: p.name in values ? this.toText(values[p.name]) : ''
			}));
		},
		useEditorProcess() {
			this.processJson = JSON.stringify(this.$store.state.editor.process, null, 2);
			Utils.ok(this, 'Process taken from the Visual Model. Click Save to keep it.');
		},
		toText(value) {
			return typeof value === 'string' ? value : JSON.stringify(value);
		},
		parseValue(text) {
			// numbers, lists and booleans as JSON, everything else (like "today - 30d") as text
			try {
				return JSON.parse(text);
			} catch {
				return text;
			}
		},
		filledParameters() {
			return Object.fromEntries(
				this.params
					.filter(p => p.value.trim() !== '')
					.map(p => [p.name, this.parseValue(p.value.trim())])
			);
		},
		async updatePreview() {
			try {
				const resolved = await this.$store.dispatch('schedules/resolve', this.filledParameters());
				this.preview = { values: resolved };
			} catch (e) {
				this.preview = { error: e.response?.data?.message || e.message };
			}
		},
		previewFor(p) {
			if (this.preview.error) {
				return this.preview.error.includes(`'${p.value.trim()}'`) ? '✕ not a valid date rule' : '';
			}
			const value = (this.preview.values || {})[p.name];
			if (typeof value !== 'string' || value === p.value.trim()) {
				return '';
			}
			return '→ ' + value.replace('T00:00:00+00:00', '') + ' today';
		},
		async submit() {
			this.error = null;
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
.param-row input { flex: 1; font-family: monospace; }
.preview { min-width: 11em; }
.preview.error { color: #dc3545; }
.hint { color: #666; font-size: 0.85em; }
.process-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
.advanced { margin-top: 4px; }
.advanced summary { cursor: pointer; }
.message.error { margin-top: 8px; }
</style>
