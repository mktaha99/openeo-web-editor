<template>
	<div id="SchedulePanel">
		<div class="toolbar">
			<button @click="showCreateForm" title="Create a new recurring schedule"><i class="fas fa-plus"></i> New Schedule</button>
			<button @click="refresh" title="Refresh the list"><i class="fas fa-sync"></i></button>
		</div>

		<div v-if="loading" class="loading">Loading schedules...</div>

		<div v-else-if="schedules.length === 0" class="empty">
			No schedules yet. Click <strong>New Schedule</strong> to create one.
		</div>

		<div v-else class="schedule-list">
			<div v-for="s in schedules" :key="s.id" class="schedule-card" :class="s.status">
				<div class="schedule-header">
					<strong>{{ s.title || s.id }}</strong>
					<span class="status-badge" :class="s.status">{{ s.status }}</span>
				</div>
				<div class="schedule-meta">
					<span><i class="fas fa-clock"></i> {{ cronToHuman(s.cron) }}</span>
					<span v-if="s.next_run_at"><i class="fas fa-forward"></i> Next: {{ formatDate(s.next_run_at) }}</span>
					<span v-if="s.last_run_at"><i class="fas fa-history"></i> Last: {{ timeAgo(s.last_run_at) }}</span>
					<span v-if="s.run_count"><i class="fas fa-hashtag"></i> {{ s.run_count }} runs</span>
				</div>
				<div v-if="s.last_error" class="schedule-error">
					<i class="fas fa-exclamation-triangle"></i> {{ s.last_error }}
				</div>
				<div class="schedule-params" v-if="Object.keys(s.parameters || {}).length">
					<span v-for="(val, key) in s.parameters" :key="key" class="param-tag">
						{{ key }} = {{ val }}
					</span>
				</div>
				<div class="schedule-actions">
					<button v-if="s.status === 'active'" @click="pause(s)" title="Pause this schedule"><i class="fas fa-pause"></i> Pause</button>
					<button v-if="s.status === 'paused'" @click="resume(s)" title="Resume this schedule"><i class="fas fa-play"></i> Resume</button>
					<button @click="showEditForm(s)" title="Edit this schedule"><i class="fas fa-edit"></i> Edit</button>
					<button @click="triggerNow(s)" title="Run this schedule now"><i class="fas fa-bolt"></i> Trigger Now</button>
					<button @click="showRuns(s)" title="View run history"><i class="fas fa-list"></i> Runs</button>
					<button @click="deleteSchedule(s)" title="Delete this schedule" class="danger"><i class="fas fa-trash"></i></button>
				</div>
			</div>
		</div>

		<!-- Create / Edit modal -->
		<div v-if="formVisible" class="modal-overlay" @click.self="formVisible = false">
			<div class="modal-content schedule-form">
				<h3>{{ editing ? 'Edit Schedule' : 'New Schedule' }}</h3>

				<label>Title</label>
				<input v-model="form.title" placeholder="Weekly AETI analysis" />

				<label>Cron Expression</label>
				<div class="cron-row">
					<input v-model="form.cron" placeholder="0 6 * * 0" />
					<span class="cron-preview">{{ cronToHuman(form.cron) }}</span>
				</div>
				<div class="cron-presets">
					<button @click="form.cron = '0 6 * * 0'" type="button">Every Sunday 06:00</button>
					<button @click="form.cron = '0 0 1 * *'" type="button">1st of month</button>
					<button @click="form.cron = '0 3 * * *'" type="button">Every day 03:00</button>
				</div>

				<label>Parameters</label>
				<div v-for="(_, idx) in form.params" :key="idx" class="param-row">
					<input v-model="form.params[idx].name" placeholder="start_date" />
					<input v-model="form.params[idx].value" placeholder="today - 50d" />
					<button @click="form.params.splice(idx, 1)" type="button" class="danger small"><i class="fas fa-times"></i></button>
				</div>
				<button @click="form.params.push({name: '', value: ''})" type="button" class="small">
					<i class="fas fa-plus"></i> Add Parameter
				</button>

				<label>Process Graph</label>
				<div class="graph-actions">
					<button @click="useCurrentGraph" type="button" class="small">
						<i class="fas fa-project-diagram"></i> Use Current Graph
					</button>
				</div>
				<textarea v-model="form.processJson" rows="12" placeholder='Paste process graph JSON with {"$param": "name"} markers' />

				<div v-if="formError" class="form-error">{{ formError }}</div>

				<div class="form-buttons">
					<button @click="formVisible = false" type="button">Cancel</button>
					<button @click="submitForm" type="button" class="primary">{{ editing ? 'Save' : 'Create' }}</button>
				</div>
			</div>
		</div>

		<!-- Runs modal -->
		<div v-if="runsVisible" class="modal-overlay" @click.self="runsVisible = false">
			<div class="modal-content runs-modal">
				<h3>Run History — {{ runsScheduleTitle }}</h3>
				<div v-if="runsLoading" class="loading">Loading runs...</div>
				<div v-else-if="runs.length === 0" class="empty">No runs yet.</div>
				<div v-else class="runs-list">
					<div v-for="run in runs" :key="run.id" class="run-row" :class="run.status">
						<span class="run-num">#{{ run.schedule_run }}</span>
						<span class="run-date">{{ formatDate(run.created) }}</span>
						<span class="run-status" :class="run.status">{{ run.status }}</span>
						<span v-if="run.resolved_params" class="run-params">
							<span v-for="(val, key) in run.resolved_params" :key="key">{{ key }}={{ typeof val === 'string' ? val.substring(0, 10) : val }}</span>
						</span>
						<span v-if="run.error" class="run-error">{{ run.error }}</span>
					</div>
				</div>
				<button @click="runsVisible = false" type="button">Close</button>
			</div>
		</div>
	</div>
</template>

<script>
export default {
	name: 'SchedulePanel',
	data() {
		return {
			loading: false,
			formVisible: false,
			editing: null,
			formError: null,
			form: this.emptyForm(),
			runsVisible: false,
			runsLoading: false,
			runsScheduleTitle: '',
			runs: [],
		};
	},
	computed: {
		schedules() {
			return this.$store.state.schedules.schedules;
		},
	},
	async mounted() {
		await this.refresh();
	},
	methods: {
		emptyForm() {
			return {
				title: '',
				cron: '0 6 * * 0',
				params: [{ name: '', value: '' }],
				processJson: '',
			};
		},
		async refresh() {
			this.loading = true;
			try {
				await this.$store.dispatch('schedules/list');
			} catch (e) {
				console.error('Failed to load schedules', e);
			}
			this.loading = false;
		},
		showCreateForm() {
			this.editing = null;
			this.form = this.emptyForm();
			this.formError = null;
			this.formVisible = true;
		},
		showEditForm(schedule) {
			this.editing = schedule.id;
			this.form = {
				title: schedule.title || '',
				cron: schedule.cron,
				params: Object.entries(schedule.parameters || {}).map(([name, value]) => ({
					name,
					value: typeof value === 'string' ? value : JSON.stringify(value),
				})),
				processJson: JSON.stringify(schedule.process, null, 2),
			};
			if (this.form.params.length === 0) {
				this.form.params.push({ name: '', value: '' });
			}
			this.formError = null;
			this.formVisible = true;
		},
		useCurrentGraph() {
			try {
				const pg = this.$store.getters['editor/processGraph'];
				if (pg) {
					this.form.processJson = JSON.stringify({ process_graph: pg.toJSON() }, null, 2);
				} else {
					this.formError = 'No process graph in the editor.';
				}
			} catch (e) {
				this.formError = 'Could not read the editor process graph.';
			}
		},
		buildPayload() {
			let process;
			try {
				process = JSON.parse(this.form.processJson);
			} catch {
				throw new Error('Invalid JSON in process graph.');
			}
			const parameters = {};
			for (const p of this.form.params) {
				if (!p.name.trim()) continue;
				let val = p.value.trim();
				// try to parse as JSON for numbers, arrays, bools
				try {
					val = JSON.parse(val);
				} catch {
					// keep as string (e.g. "today - 50d")
				}
				parameters[p.name.trim()] = val;
			}
			return {
				process,
				parameters,
				cron: this.form.cron,
				title: this.form.title || undefined,
			};
		},
		async submitForm() {
			this.formError = null;
			let payload;
			try {
				payload = this.buildPayload();
			} catch (e) {
				this.formError = e.message;
				return;
			}
			try {
				if (this.editing) {
					await this.$store.dispatch('schedules/update', { id: this.editing, data: payload });
				} else {
					await this.$store.dispatch('schedules/create', payload);
				}
				this.formVisible = false;
			} catch (e) {
				const msg = e.response?.data?.message || e.message;
				this.formError = msg;
			}
		},
		async pause(s) {
			try {
				await this.$store.dispatch('schedules/pause', s.id);
			} catch (e) {
				alert('Failed to pause: ' + (e.response?.data?.message || e.message));
			}
		},
		async resume(s) {
			try {
				await this.$store.dispatch('schedules/resume', s.id);
			} catch (e) {
				alert('Failed to resume: ' + (e.response?.data?.message || e.message));
			}
		},
		async triggerNow(s) {
			try {
				const jobId = await this.$store.dispatch('schedules/trigger', s.id);
				alert(`Triggered! Job ${jobId} is queued.`);
				await this.refresh();
			} catch (e) {
				alert('Trigger failed: ' + (e.response?.data?.message || e.message));
			}
		},
		async deleteSchedule(s) {
			if (!confirm(`Delete schedule "${s.title || s.id}"? Previous runs are kept.`)) return;
			try {
				await this.$store.dispatch('schedules/delete', s.id);
			} catch (e) {
				alert('Delete failed: ' + (e.response?.data?.message || e.message));
			}
		},
		async showRuns(s) {
			this.runsScheduleTitle = s.title || s.id;
			this.runsVisible = true;
			this.runsLoading = true;
			this.runs = [];
			try {
				this.runs = await this.$store.dispatch('schedules/runs', s.id);
			} catch (e) {
				console.error('Failed to load runs', e);
			}
			this.runsLoading = false;
		},
		cronToHuman(cron) {
			if (!cron) return '';
			try {
				const parts = cron.split(' ');
				if (parts.length !== 5) return cron;
				const [min, hour, dom, mon, dow] = parts;
				const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
				if (dow !== '*' && dom === '*' && mon === '*') {
					return `Every ${days[parseInt(dow)] || dow} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
				}
				if (dom !== '*' && dow === '*' && mon === '*') {
					const suffix = dom === '1' ? 'st' : dom === '2' ? 'nd' : dom === '3' ? 'rd' : 'th';
					return `${dom}${suffix} of every month at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
				}
				if (dom === '*' && dow === '*' && mon === '*') {
					return `Every day at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
				}
				return cron;
			} catch {
				return cron;
			}
		},
		formatDate(dateStr) {
			if (!dateStr) return '';
			return new Date(dateStr).toLocaleString();
		},
		timeAgo(dateStr) {
			if (!dateStr) return '';
			const diff = Date.now() - new Date(dateStr).getTime();
			const mins = Math.floor(diff / 60000);
			if (mins < 60) return `${mins}m ago`;
			const hours = Math.floor(mins / 60);
			if (hours < 24) return `${hours}h ago`;
			return `${Math.floor(hours / 24)}d ago`;
		},
	},
};
</script>

<style scoped>
#SchedulePanel { padding: 8px; }
.toolbar { margin-bottom: 10px; display: flex; gap: 6px; }
.toolbar button { cursor: pointer; }
.loading, .empty { padding: 20px; text-align: center; color: #888; }

.schedule-list { display: flex; flex-direction: column; gap: 8px; }
.schedule-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa; }
.schedule-card.paused { opacity: 0.7; }
.schedule-card.deleted { display: none; }

.schedule-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.status-badge { font-size: 0.75em; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; font-weight: bold; }
.status-badge.active { background: #d4edda; color: #155724; }
.status-badge.paused { background: #e2e3e5; color: #383d41; }

.schedule-meta { font-size: 0.85em; color: #555; display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
.schedule-meta i { margin-right: 3px; }
.schedule-error { font-size: 0.85em; color: #dc3545; margin: 4px 0; }

.schedule-params { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.param-tag { font-size: 0.8em; background: #e9ecef; padding: 1px 6px; border-radius: 3px; font-family: monospace; }

.schedule-actions { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.schedule-actions button { font-size: 0.8em; cursor: pointer; padding: 3px 8px; border: 1px solid #ccc; border-radius: 3px; background: #fff; }
.schedule-actions button:hover { background: #f0f0f0; }
.schedule-actions button.danger { color: #dc3545; border-color: #dc3545; }

/* Modal */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.modal-content { background: #fff; border-radius: 8px; padding: 20px; max-width: 700px; width: 90%; max-height: 85vh; overflow-y: auto; }
.modal-content h3 { margin-top: 0; }
.modal-content label { display: block; margin-top: 10px; font-weight: bold; font-size: 0.9em; }
.modal-content input, .modal-content textarea { width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 0.9em; box-sizing: border-box; }
.modal-content textarea { resize: vertical; }

.cron-row { display: flex; gap: 8px; align-items: center; }
.cron-row input { flex: 1; }
.cron-preview { font-size: 0.85em; color: #555; white-space: nowrap; }
.cron-presets { display: flex; gap: 4px; margin-top: 4px; }
.cron-presets button { font-size: 0.75em; cursor: pointer; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; background: #f8f9fa; }

.param-row { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
.param-row input { flex: 1; }
button.small { font-size: 0.8em; padding: 3px 8px; cursor: pointer; border: 1px solid #ccc; border-radius: 3px; background: #fff; margin-top: 4px; }

.graph-actions { margin-top: 4px; }

.form-error { color: #dc3545; margin-top: 8px; padding: 6px; background: #f8d7da; border-radius: 4px; font-size: 0.9em; }
.form-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.form-buttons button { padding: 6px 16px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; }
.form-buttons button.primary { background: #0d6efd; color: #fff; border-color: #0d6efd; }

/* Runs modal */
.runs-list { max-height: 400px; overflow-y: auto; }
.run-row { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 0.85em; flex-wrap: wrap; }
.run-num { font-weight: bold; min-width: 40px; }
.run-status { padding: 1px 6px; border-radius: 3px; font-size: 0.85em; }
.run-status.finished { background: #d4edda; color: #155724; }
.run-status.error { background: #f8d7da; color: #721c24; }
.run-status.queued, .run-status.running { background: #fff3cd; color: #856404; }
.run-params span { font-family: monospace; font-size: 0.85em; }
.run-error { color: #dc3545; font-size: 0.85em; }
</style>
