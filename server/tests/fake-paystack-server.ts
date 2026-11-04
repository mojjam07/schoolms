import { startFakePaystack } from './fake-paystack';
startFakePaystack(4010).then(() => console.log('fake Paystack on :4010'));
