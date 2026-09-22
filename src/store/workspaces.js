import Utils from '../utils.js';

// The js-client has no workspace methods (not part of @openeo/js-client), so this module
// talks to the backend's /workspaces and /workspace_providers endpoints directly via axios.
function authHeaders(connection) {
	const provider = connection.getAuthProvider();
	return provider ? {Authorization: 'Bearer ' + provider.getToken()} : {};
}

export default {
	namespaced: true,
	state: {
		workspaces: [],
		providers: []
	},
	getters: {
		supportsList: (state, getters, rootState) => rootState.connection !== null
	},
	actions: {
		async list(cx) {
			const connection = cx.rootState.connection;
			const response = await Utils.axios().get(connection.getBaseUrl() + '/workspaces', {headers: authHeaders(connection)});
			cx.commit('workspaces', response.data.workspaces);
			return cx.state.workspaces;
		},
		async listProviders(cx) {
			const connection = cx.rootState.connection;
			const response = await Utils.axios().get(connection.getBaseUrl() + '/workspace_providers', {headers: authHeaders(connection)});
			cx.commit('providers', response.data);
			return cx.state.providers;
		},
		async create(cx, {title}) {
			const connection = cx.rootState.connection;
			const response = await Utils.axios().post(connection.getBaseUrl() + '/workspaces', {intent: 'create', title}, {headers: authHeaders(connection)});
			cx.commit('upsert', response.data);
			return response.data;
		},
		async register(cx, {title, storage_type, bucket, prefix}) {
			const connection = cx.rootState.connection;
			const response = await Utils.axios().post(connection.getBaseUrl() + '/workspaces', {intent: 'register', title, storage_type, bucket, prefix}, {headers: authHeaders(connection)});
			cx.commit('upsert', response.data);
			return response.data;
		},
		async probe(cx, title) {
			const connection = cx.rootState.connection;
			const response = await Utils.axios().get(connection.getBaseUrl() + '/workspaces/' + encodeURIComponent(title), {headers: authHeaders(connection)});
			cx.commit('upsert', response.data);
			return response.data;
		},
		async remove(cx, title) {
			const connection = cx.rootState.connection;
			await Utils.axios().delete(connection.getBaseUrl() + '/workspaces/' + encodeURIComponent(title), {headers: authHeaders(connection)});
			cx.commit('delete', title);
		}
	},
	mutations: {
		workspaces(state, workspaces) {
			state.workspaces = workspaces;
		},
		providers(state, providers) {
			state.providers = providers;
		},
		upsert(state, workspace) {
			const index = state.workspaces.findIndex(w => w.id === workspace.id);
			if (index >= 0) {
				state.workspaces.splice(index, 1, workspace);
			}
			else {
				state.workspaces.push(workspace);
			}
		},
		delete(state, title) {
			state.workspaces = state.workspaces.filter(w => w.title !== title);
		}
	}
};
