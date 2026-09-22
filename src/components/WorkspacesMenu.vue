<template>
	<div id="WorkspacesMenu">
		<div class="menuItem">
			<div class="down">
				<i class="fas fa-chevron-down"></i>
			</div>
			<div class="data">
				<span class="name nowrap"><i class="fas fa-folder-open"></i> Workspaces</span>
			</div>
		</div>
		<div class="dropdown">
			<strong v-if="workspaces.length === 0" class="item">No workspaces yet.</strong>
			<a v-for="ws in workspaces" :key="ws.id" class="item workspace" :class="{pending: ws.status === 'pending'}" @click.prevent="showFiles(ws)">
				<div class="row">
					<div class="title" :title="ws.title"><i class="fas fa-folder"></i> {{ ws.title }}</div>
					<div class="actions">
						<button v-if="ws.status === 'pending'" type="button" @click.stop.prevent="probeWorkspace(ws)"><i class="fas fa-sync"></i> Check access</button>
						<button type="button" @click.stop.prevent="removeWorkspace(ws)"><i class="fas fa-trash"></i> Delete</button>
					</div>
				</div>
				<small v-if="ws.status === 'pending'" title="Access not granted yet">Access not granted yet</small>
			</a>
			<hr />
			<a class="item" @click.prevent="addWorkspace"><i class="fas fa-plus"></i> Add workspace</a>
		</div>
	</div>
</template>

<script>
import EventBusMixin from './EventBusMixin.js';
import Utils from '../utils.js';

export default {
	name: 'WorkspacesMenu',
	mixins: [EventBusMixin],
	computed: {
		...Utils.mapState('workspaces', ['workspaces'])
	},
	mounted() {
		this.list().catch(error => Utils.exception(this, error, 'Loading Workspaces Error'));
	},
	methods: {
		...Utils.mapActions('workspaces', ['list', 'remove', 'probe']),
		addWorkspace() {
			this.broadcast('showModal', 'WorkspaceModal');
		},
		async removeWorkspace(ws) {
			if (!confirm(`Do you really want to delete the workspace "${ws.title}"?`)) {
				return;
			}
			try {
				await this.remove(ws.title);
			} catch (error) {
				Utils.exception(this, error, 'Delete Workspace Error');
			}
		},
		async probeWorkspace(ws) {
			try {
				const updated = await this.probe(ws.title);
				if (updated.status === 'active') {
					Utils.ok(this, `Workspace "${ws.title}" is now active.`);
				}
				else {
					Utils.error(this, `Workspace "${ws.title}" still doesn't have access. Make sure the IAM grant is in place.`);
				}
			} catch (error) {
				Utils.exception(this, error, 'Check Access Error');
			}
		},
		showFiles(ws) {
			this.broadcast('showDataModal', ws, `Workspace: ${ws.title}`);
		}
	}
}
</script>

<style lang="scss" scoped>
// Wider than the default dropdown min-width (200px, see IDE.vue) — a workspace row needs
// room for its title plus two labeled buttons without wrapping/cramming.
.dropdown {
	min-width: 320px;
}
.down {
	width: 1em;
	padding-right: 10px;
}
.name {
	display: block;
	white-space: nowrap;
}
.item.workspace {
	.row {
		display: flex;
		align-items: center;
		gap: 0.5em;
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.actions {
		display: flex;
		gap: 0.25em;
		flex-shrink: 0;

		button {
			margin: 0;
			white-space: nowrap;
		}
	}

	small {
		display: block;
		margin-top: 0.25em;
		color: #a66;
		font-style: italic;
	}
}
</style>
