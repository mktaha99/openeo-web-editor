/**
 * Vuex store for recurring job schedules.
 * Uses direct axios calls since @openeo/js-client doesn't know about /schedules.
 */
import Vue from 'vue';
import axios from 'axios';

function request(rootState, method, path = '', data = undefined) {
	const connection = rootState.connection;
	const token = connection.authProvider?.getToken?.();
	return axios({
		method,
		url: connection.getBaseUrl().replace(/\/$/, '') + '/schedules' + path,
		data,
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
}

export default {
	namespaced: true,
	state: () => ({
		schedules: [],
	}),
	actions: {
		async list({ commit, rootState }) {
			const resp = await request(rootState, 'get');
			commit('setAll', resp.data.schedules);
		},
		async get({ commit, rootState }, id) {
			const resp = await request(rootState, 'get', `/${id}`);
			commit('upsert', resp.data);
			return resp.data;
		},
		async create({ dispatch, rootState }, data) {
			const resp = await request(rootState, 'post', '', data);
			return dispatch('get', resp.headers['openeo-identifier']);
		},
		async update({ dispatch, rootState }, { id, data }) {
			await request(rootState, 'patch', `/${id}`, data);
			return dispatch('get', id);
		},
		async delete({ commit, rootState }, id) {
			await request(rootState, 'delete', `/${id}`);
			commit('remove', id);
		},
		async pause({ dispatch, rootState }, id) {
			await request(rootState, 'post', `/${id}/pause`);
			return dispatch('get', id);
		},
		async resume({ dispatch, rootState }, id) {
			await request(rootState, 'post', `/${id}/resume`);
			return dispatch('get', id);
		},
		async trigger({ rootState }, id) {
			const resp = await request(rootState, 'post', `/${id}/trigger`);
			return resp.headers['openeo-identifier'];
		},
		async runs({ rootState }, id) {
			const resp = await request(rootState, 'get', `/${id}/runs`);
			return resp.data.runs;
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
