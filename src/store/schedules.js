/**
 * Vuex store for recurring job schedules.
 * Uses direct axios calls since @openeo/js-client doesn't know about /schedules.
 */
import Vue from 'vue';
import axios from 'axios';

function apiUrl(state, rootState) {
	let url = rootState.connection ? rootState.connection.getBaseUrl() : '';
	// remove trailing slash
	return url.replace(/\/$/, '');
}

function authHeaders(rootState) {
	const token = rootState.connection?.authProvider?.getToken?.();
	if (!token) return {};
	return { Authorization: `Bearer ${token}` };
}

export default {
	namespaced: true,
	state: () => ({
		schedules: [],
	}),
	getters: {
		getById: (state) => (id) => state.schedules.find(s => s.id === id) || null,
	},
	actions: {
		async list({ commit, rootState }) {
			const url = apiUrl(null, rootState);
			const resp = await axios.get(`${url}/schedules`, { headers: authHeaders(rootState) });
			commit('setAll', resp.data.schedules || []);
			return resp.data.schedules;
		},
		async get({ commit, rootState }, id) {
			const url = apiUrl(null, rootState);
			const resp = await axios.get(`${url}/schedules/${id}`, { headers: authHeaders(rootState) });
			commit('upsert', resp.data);
			return resp.data;
		},
		async create({ commit, rootState }, data) {
			const url = apiUrl(null, rootState);
			const resp = await axios.post(`${url}/schedules`, data, { headers: authHeaders(rootState) });
			const id = resp.headers['openeo-identifier'];
			// fetch the full schedule to add to the store
			const full = await axios.get(`${url}/schedules/${id}`, { headers: authHeaders(rootState) });
			commit('upsert', full.data);
			return full.data;
		},
		async update({ commit, rootState }, { id, data }) {
			const url = apiUrl(null, rootState);
			await axios.patch(`${url}/schedules/${id}`, data, { headers: authHeaders(rootState) });
			const full = await axios.get(`${url}/schedules/${id}`, { headers: authHeaders(rootState) });
			commit('upsert', full.data);
			return full.data;
		},
		async delete({ commit, rootState }, id) {
			const url = apiUrl(null, rootState);
			await axios.delete(`${url}/schedules/${id}`, { headers: authHeaders(rootState) });
			commit('remove', id);
		},
		async pause({ commit, rootState }, id) {
			const url = apiUrl(null, rootState);
			await axios.post(`${url}/schedules/${id}/pause`, null, { headers: authHeaders(rootState) });
			const full = await axios.get(`${url}/schedules/${id}`, { headers: authHeaders(rootState) });
			commit('upsert', full.data);
			return full.data;
		},
		async resume({ commit, rootState }, id) {
			const url = apiUrl(null, rootState);
			await axios.post(`${url}/schedules/${id}/resume`, null, { headers: authHeaders(rootState) });
			const full = await axios.get(`${url}/schedules/${id}`, { headers: authHeaders(rootState) });
			commit('upsert', full.data);
			return full.data;
		},
		async trigger({ rootState }, id) {
			const url = apiUrl(null, rootState);
			const resp = await axios.post(`${url}/schedules/${id}/trigger`, null, { headers: authHeaders(rootState) });
			return resp.headers['openeo-identifier'];
		},
		async runs({ rootState }, id) {
			const url = apiUrl(null, rootState);
			const resp = await axios.get(`${url}/schedules/${id}/runs`, { headers: authHeaders(rootState) });
			return resp.data.runs || [];
		},
		async resolve({ rootState }, parameters) {
			const url = apiUrl(null, rootState);
			const resp = await axios.post(`${url}/schedules/resolve`, parameters, { headers: authHeaders(rootState) });
			return resp.data;
		},
	},
	mutations: {
		setAll(state, schedules) {
			state.schedules = schedules;
		},
		upsert(state, schedule) {
			const idx = state.schedules.findIndex(s => s.id === schedule.id);
			if (idx >= 0) {
				Vue.set(state.schedules, idx, schedule);
			} else {
				state.schedules.push(schedule);
			}
		},
		remove(state, id) {
			const idx = state.schedules.findIndex(s => s.id === id);
			if (idx >= 0) Vue.delete(state.schedules, idx);
		},
		reset(state) {
			state.schedules = [];
		},
	},
};
