// Route module of the session screen "sign-up": binds the single AuthContainer to this
// screen's view and to its verb (signUp). The container asks the AuthPort for the verb;
// this file names no SDK. On success the container navigates to "/" (the signed-in home).
//
// The account is created by the identity provider; whether the person is signed in right away
// or first has to confirm their email depends on the project's sign-in settings.

import * as React from 'react';
import { AuthContainer } from './auth.container';
import { SignUpView } from '../views/sign-up.view';

export default function SignUpRoute(): React.ReactElement {
  return <AuthContainer intent="signUp" view={SignUpView} />;
}
