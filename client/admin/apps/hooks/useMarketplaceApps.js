import { useRef, useState, useCallback, useEffect, useMemo } from 'react';

import { Apps } from '../../../../app/apps/client/orchestrator';
import { AppEvents } from '../../../../app/apps/client/communication';
import { handleAPIError } from '../helpers';

/* TODO
 *	If order is reversed and search is performed, the result will return in the wrong order, then refresh correctly
 */
export function useMarketplaceApps({ debouncedText, debouncedSort, current, itemsPerPage }) {
	const [data, setData] = useState({});
	const ref = useRef();
	ref.current = data;

	const getDataCopy = () => ref.current.slice(0);

	const stringifiedData = JSON.stringify(data);

	const handleAppAddedOrUpdated = useCallback(async (appId) => {
		try {
			const { status, version } = await Apps.getApp(appId);
			const app = await Apps.getAppFromMarketplace(appId, version);
			const updatedData = getDataCopy();
			const index = updatedData.findIndex(({ id }) => id === appId);
			updatedData[index] = {
				...app,
				installed: true,
				status,
				version,
				marketplaceVersion: app.version,
			};
			setData(updatedData);
		} catch (error) {
			handleAPIError(error);
		}
	}, [stringifiedData, setData]);

	const handleAppRemoved = useCallback((appId) => {
		const updatedData = getDataCopy();
		const app = updatedData.find(({ id }) => id === appId);
		if (!app) {
			return;
		}
		delete app.installed;
		delete app.status;
		app.version = app.marketplaceVersion;

		setData(updatedData);
	}, [stringifiedData, setData]);

	const handleAppStatusChange = useCallback(({ appId, status }) => {
		const updatedData = getDataCopy();
		const app = updatedData.find(({ id }) => id === appId);

		if (!app) {
			return;
		}
		app.status = status;
		setData(updatedData);
	}, [stringifiedData, setData]);

	useEffect(() => {
		(async () => {
			try {
				const marketAndInstalledApps = await Promise.all([Apps.getAppsFromMarketplace(), Apps.getApps()]);
				const appsData = marketAndInstalledApps[0].map((app) => {
					const installedApp = marketAndInstalledApps[1].find(({ id }) => id === app.id);
					if (!installedApp) {
						return {
							...app,
							status: undefined,
							marketplaceVersion: app.version,
						};
					}

					return {
						...app,
						installed: true,
						status: installedApp.status,
						version: installedApp.version,
						marketplaceVersion: app.version,
					};
				});

				setData(appsData.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));

				Apps.getWsListener().registerListener(AppEvents.APP_ADDED, handleAppAddedOrUpdated);
				Apps.getWsListener().registerListener(AppEvents.APP_UPDATED, handleAppAddedOrUpdated);
				Apps.getWsListener().registerListener(AppEvents.APP_REMOVED, handleAppRemoved);
				Apps.getWsListener().registerListener(AppEvents.APP_STATUS_CHANGE, handleAppStatusChange);
			} catch (e) {
				handleAPIError(e);
			}
		})();

		return () => {
			Apps.getWsListener().unregisterListener(AppEvents.APP_ADDED, handleAppAddedOrUpdated);
			Apps.getWsListener().unregisterListener(AppEvents.APP_UPDATED, handleAppAddedOrUpdated);
			Apps.getWsListener().unregisterListener(AppEvents.APP_REMOVED, handleAppRemoved);
			Apps.getWsListener().unregisterListener(AppEvents.APP_STATUS_CHANGE, handleAppStatusChange);
		};
	}, []);

	const filteredValues = useMemo(() => {
		if (data.length) {
			let filtered = debouncedSort[1] === 'asc' ? data : data.reverse();

			filtered = debouncedText ? filtered.filter((app) => app.name.toLowerCase().indexOf(debouncedText.toLowerCase()) > -1) : filtered;

			const filteredLength = filtered.length;

			const sliceStart = current > filteredLength ? 0 : current;

			filtered = filtered.slice(sliceStart, current + itemsPerPage);

			return [filtered, filteredLength];
		}
		return [null, 0];
	}, [debouncedText, debouncedSort[1], stringifiedData, current, itemsPerPage]);

	return [...filteredValues];
}