# Reads FRAME metadata and extracts all storage items.

import sys
import json

exclude_pallets = [
	"AhMigrator",
	"AhOps",
	"Auctions",
	"AuthorityDiscovery",
	"Authorship",
	"Babe",
	"Beefy",
	"BeefyMmrLeaf",
	"CollatorSelection",
	"Configuration",
	"CoretimeAssignmentProvider",
	"Dmp",
	"ElectionProviderMultiPhase",
	"Grandpa",
	"Historical",
	"Hrmp",
	"Initializer",
	"MessageQueue",
	"Mmr",
	"OnDemand",
	"ParaInclusion",
	"ParaInherent",
	"Paras",
	"ParaScheduler",
	"ParasDisputes",
	"ParaSessionInfo",
	"ParasShared",
	"ParasSlashing",
	"PolkadotXcm",
	"RcMigrator",
	"Registrar",
	"Session",
	"StateTrieMigration",
	"System",
	"Timestamp",
	"TransactionPayment",
	"XcmPallet",
	"XcmpQueue",
]

def main(path_arg):
	print(f"Reading metadata from {path_arg}")
	with open(path_arg, "r") as f:
		metadata = json.load(f)

	storage_per_pallet = {}

	for pallet in metadata["V14"]["pallets"]:
		name = pallet["name"]
		storage = pallet["storage"]
		if storage is None:
			continue
		storage_per_pallet[name] = []

		for item in storage["entries"]:
			storage_per_pallet[name].append(item["name"])

	functionalities = [
		# The storage on Asset Hub is empty before migration.
		("ah_pre", "empty"),
		# The storage on Relay Chain is removed after migration.
		("rc_post", "empty"),
		# The storage on Asset Hub has the correct length after migration.
		("ah_post", "length"),
		# The storage on Asset Hub is consistent after migration.
		("ah_post", "consistent"),
		# The storage on Asset Hub is correct after migration. Eg it contains the values that we expect.
		("ah_post", "correct"),
	]

	output = []

	for name, items in storage_per_pallet.items():
		if name in exclude_pallets:
			skip = ""
			output.append({
				"full_name": f"{name}::{skip}::{skip}::{skip}",
				"pallet": name,
				"storage": skip,
				"when": skip,
				"assertion": skip,
				"rust-unit-test": skip,
				"chopsticks": skip,
			})
			continue
		for item in items:
			for (when, what) in functionalities:
				output.append({
					"full_name": f"{name}::{item}::{when}::{what}",
					"pallet": name,
					"storage": item,
					"when": when,
					"assertion": what,
					"rust-unit-test": "",
					"chopsticks": "",
				})

	return output

if __name__ == "__main__":
	# First argument is the path to the metadata.
	if len(sys.argv) < 2:
		print("Usage: python3 metadata.py <path-to-metadata>")
		sys.exit(1)

	path_arg = sys.argv[1]
	output = main(path_arg)
	print(json.dumps(output, indent=4))
