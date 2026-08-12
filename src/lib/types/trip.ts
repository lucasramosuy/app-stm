export interface TripStopRef {
	busstopId: number;
	label: string;
	coordinates: [number, number];
}

export interface TripLeg {
	line: string;
	boardStop: TripStopRef;
	alightStop: TripStopRef;
}

export interface TripOption {
	transfers: number;
	legs: TripLeg[];
	walkToFirstStopM: number;
	walkFromLastStopM: number;
}