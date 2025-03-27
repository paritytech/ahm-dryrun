"""
Match the outputs of the `scan.py` and `metadata.py` scripts and print the result as csv.
"""

import difflib
import code
import sys
import metadata
import subprocess
import os
import csv

def main(runtimes_repo):
	exit = 0
	# Maps requirement to None | fulfillment
	storage_output = {}
	# pallet, storage, when, assertion, rust-unit-test (location)
	storage_csv = []

	storage_reqs = metadata.main("polkadot.metadata.json")
	print(f'Found {len(storage_reqs)} storage requirements')
	storage_reqs_by_name = {r["full_name"]: r for r in storage_reqs}

	fulfils = code.main(runtimes_repo)
	(storage_fulfils, function_fulfils) = (fulfils["storage"], fulfils["functionality"])
	print(f'Found {len(storage_fulfils)} storage and {len(function_fulfils)} functional fulfillments')

	commit = github_commit(runtimes_repo)
	
	for req in storage_reqs:
		fullillments = find_storage_req(storage_fulfils, req)
		for i, ful in enumerate(fullillments):
			storage_fulfils.remove(ful)
			print(f'✅ Requirement fulfilled "{req["full_name"]}"{f" #{i}" if i > 0 else ""}')

		storage_output[req["full_name"]] = fullillments

	for f in storage_fulfils:
		suggest_storage_req(storage_reqs, f)
		exit = 1
	
	if len(storage_csv) > 0:
		sys.exit(exit)

	for req_name, fulfillments in storage_output.items():
		req = storage_reqs_by_name[req_name]
		rel_paths = []

		for fulfillment in fulfillments:
			rel_paths.append(fulfillment["rel_path"])
		
		storage_csv.append(csv_fmt_req(req, rel_paths, commit))

	fulfilled = len([f for f in storage_csv if f[5] != ""]) # ghetto code
	coverage = fulfilled / len(storage_reqs) * 100
	print(f'Coverage: {coverage:.2f}%')
	
	# Write to csv
	abs_csv = os.path.abspath("storage.csv")
	with open(abs_csv, "w") as f:
		writer = csv.writer(f)
		writer.writerow(["Pallet", "Storage", "Assertion", "Chain", "When", "Rust Test"])
		writer.writerows(storage_csv)
		print(f'Wrote {len(storage_csv)} storage requirements to {abs_csv}')

def csv_fmt_req(req, locations, commit):
	if req["when"] == "ah_pre":
		(where, when) = ("Asset Hub", "before")
	elif req["when"] == "rc_pre":
		(where, when) = ("Relay", "before")
	elif req["when"] == "ah_post":
		(where, when) = ("Asset Hub", "after")
	elif req["when"] == "rc_post":
		(where, when) = ("Relay", "after")
	elif req["when"] == "":
		(where, when) = ("", "")
	
	return [
		req["pallet"],
		req["storage"],
		req["assertion"],
		where,
		when,
		' '.join([csv_fmt_location(location, commit) for location in locations])
	]

def csv_fmt_location(file, commit):
	if file == "":
		return ""
	line = file.split(":")[1]
	return f"[line {line}](https://github.com/polkadot-fellows/runtimes/tree/{commit}/{file})"

def find_storage_req(storage_reqs, f):
	found = []
	for req in storage_reqs:
		if req["pallet"] == f["pallet"] and req["storage"] == f["storage"] and req["when"] == f["when"] and req["assertion"] == f["assertion"]:
			found.append(req)

	return found

def suggest_storage_req(storage_reqs, f):
	# Fuzzy search to find closes match
	full_name = f"{f['pallet']}::{f['storage']}::{f['when']}::{f['assertion']}"
	req_names = [f"{r['pallet']}::{r['storage']}::{r['when']}::{r['assertion']}" for r in storage_reqs]
	closest_match = difflib.get_close_matches(full_name, req_names, n=1, cutoff=0.5)
	
	if closest_match:
		match = closest_match[0]
		print(f'\n❌ Property "{full_name}" not found. Maybe you meant:')
		print(f'            "{match}"')
		
		for (a, b) in zip(full_name.split('::'), match.split('::')):
			if a != b:
				print(f'    "{a}" → "{b}"')
		print(f'at {f["abs_path"]}\n')
				
		#return storage_reqs[req_names.index(match)]
	return None

def github_commit(repo):
	repo_path = os.path.abspath(repo)
	
	commit = subprocess.check_output(["git", "-C", repo_path, "rev-parse", "HEAD"]).decode("utf-8").strip()
	return commit

if __name__ == "__main__":
	if len(sys.argv) != 2:
		print("Usage: python3 main.py <runtimes-repo>")
		sys.exit(1)
	
	main(sys.argv[1])
