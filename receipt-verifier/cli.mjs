#!/usr/bin/env node
import process from 'node:process'
import console from 'node:console'
import { verifyFile, VerificationError } from './verify.mjs'
const args = process.argv.slice(2)
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log(
    'Usage: node --experimental-strip-types receipt-verifier/cli.mjs <receipt.json>\nChecks bounded ChangeReceipt v1 self-consistency, NOT trusted authenticity.\nExit: 0 consistent; 1 invalid/inconsistent; 2 usage or file access error.\nNo source values are printed; input is never modified.',
  )
} else if (args.length !== 1 || args[0].startsWith('-')) {
  console.error('Usage: node --experimental-strip-types receipt-verifier/cli.mjs <receipt.json>')
  process.exitCode = 2
} else {
  try {
    const result = await verifyFile(args[0])
    console.log(`Consistent ChangeReceipt v1. Comparison complete: ${result.complete}.`)
    console.log(
      'Self-consistency only: no trusted origin, signature, or physical inventory verification.',
    )
  } catch (error) {
    if (error instanceof VerificationError) {
      console.error(`Receipt rejected: ${error.code}.`)
      process.exitCode = 1
    } else {
      console.error('Unable to verify receipt: file access or runtime error.')
      process.exitCode = 2
    }
  }
}
