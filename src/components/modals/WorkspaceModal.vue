<template>
	<Modal id="WorkspaceModal" width="50%" :title="title" @closed="$emit('closed')">
		<template #default>
			<div v-if="!intent" class="start">
				<p>Workspaces let you export results (e.g. from <code>export_workspace</code>) to your own cloud storage.</p>
				<ul>
					<li class="element" @click="intent = 'create'">
						<div class="summary">
							<strong>Create a new workspace</strong>
							<small>Creates a folder in this back-end's managed storage. No credentials needed.</small>
						</div>
					</li>
					<li class="element" @click="intent = 'register'">
						<div class="summary">
							<strong>Register an external workspace</strong>
							<small>Connect a cloud storage bucket that you already own.</small>
						</div>
					</li>
				</ul>
			</div>
			<form v-else @submit.prevent.stop="submit">
				<p>
					<label for="ws_title">Name</label>
					<input type="text" id="ws_title" v-model="form.title" required placeholder="my-workspace" />
				</p>
				<template v-if="intent === 'register'">
					<p>
						<label for="ws_provider">Provider</label>
						<select id="ws_provider" v-model="providerId" required>
							<option v-for="p in providers" :key="p.id" :value="p.id">{{ p.title }}</option>
						</select>
						<small v-if="provider">{{ provider.description }}</small>
					</p>
					<p>
						<label for="ws_bucket">Bucket</label>
						<input type="text" id="ws_bucket" v-model="form.bucket" required placeholder="your-bucket-name" />
					</p>
					<p>
						<label for="ws_prefix">Prefix (optional)</label>
						<input type="text" id="ws_prefix" v-model="form.prefix" placeholder="e.g. openeo/" />
					</p>
					<div class="message warning" v-if="grantInstructions">
						<i class="fas fa-bullhorn"></i>
						<span>
							This back-end never receives your credentials. Before registering, grant it access
							by running the following against your own bucket:
							<pre>{{ grantInstructions }}</pre>
						</span>
					</div>
				</template>
			</form>
		</template>
		<template #footer>
			<template v-if="intent">
				<div class="back">
					<button type="button" @click="reset">Back</button>
				</div>
				<div class="next">
					<button type="submit" :disabled="!valid || loading" @click="submit">
						<i v-show="loading" class="fas fa-spinner fa-spin"></i>
						{{ intent === 'create' ? 'Create' : 'Register' }}
					</button>
				</div>
			</template>
		</template>
	</Modal>
</template>

<script>
import Modal from './Modal.vue';
import Utils from '../../utils';

export default {
	name: 'WorkspaceModal',
	components: {
		Modal
	},
	data() {
		return {
			intent: null,
			providerId: null,
			form: {
				title: '',
				bucket: '',
				prefix: ''
			},
			loading: false
		};
	},
	computed: {
		...Utils.mapState('workspaces', ['providers']),
		title() {
			if (this.intent === 'create') {
				return 'Create Workspace';
			}
			else if (this.intent === 'register') {
				return 'Register Workspace';
			}
			return 'Add Workspace';
		},
		provider() {
			return this.providers.find(p => p.id === this.providerId) || null;
		},
		grantInstructions() {
			return this.provider ? this.provider.grant_instructions : null;
		},
		valid() {
			if (!Utils.hasText(this.form.title)) {
				return false;
			}
			if (this.intent === 'register') {
				return Boolean(this.provider) && Utils.hasText(this.form.bucket);
			}
			return true;
		}
	},
	async created() {
		if (this.providers.length === 0) {
			await this.listProviders();
		}
		if (this.providers.length > 0) {
			this.providerId = this.providers[0].id;
		}
	},
	methods: {
		...Utils.mapActions('workspaces', ['listProviders', 'create', 'register']),
		reset() {
			this.intent = null;
			this.form = {title: '', bucket: '', prefix: ''};
		},
		async submit() {
			if (!this.valid) {
				return;
			}
			this.loading = true;
			try {
				if (this.intent === 'create') {
					await this.create({title: this.form.title});
					Utils.ok(this, `Workspace "${this.form.title}" created.`);
				}
				else {
					const workspace = await this.register({
						title: this.form.title,
						storage_type: this.provider.storage_type,
						bucket: this.form.bucket,
						prefix: this.form.prefix
					});
					if (workspace.status === 'active') {
						Utils.ok(this, `Workspace "${this.form.title}" registered and active.`);
					}
					else {
						Utils.ok(this, `Workspace "${this.form.title}" registered as pending. Grant access as shown above, `
							+ `then use "Check access" in the workspace menu to activate it.`);
					}
				}
				this.$emit('closed');
			} catch (error) {
				Utils.exception(this, error, 'Workspace Error');
			} finally {
				this.loading = false;
			}
		}
	}
}
</script>

<style scoped lang="scss">
@use '../../../theme' as *;

.start ul {
	margin: 1em 0;
	padding: 0;

	li {
		list-style-type: none;
	}
}

.element {
	display: flex;
	margin: 0.25em 0;
	padding: 0;
	border: 1px solid #ddd;
	border-radius: 3px;
	cursor: pointer;
	user-select: none;

	.summary {
		flex-grow: 1;
		padding: 0.5em;
		width: 100%;

		strong {
			display: block;
			color: $linkColor;
		}

		small {
			margin-top: 0.25em;
			display: block;
		}

		&:hover {
			background-color: #eee;

			strong {
				color: #000;
			}
		}
	}
}

form p {
	display: flex;
	flex-direction: column;
	margin: 0 0 1em 0;

	label {
		font-weight: bold;
		margin-bottom: 0.25em;
	}

	small {
		margin-top: 0.25em;
		color: #666;
	}
}

.back {
	float: left;
}

.message pre {
	white-space: pre-wrap;
	word-break: break-word;
	margin: 0.5em 0 0 0;
}
</style>
