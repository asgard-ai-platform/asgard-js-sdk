import { ReactElement } from 'react';

function NotFound(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        backgroundImage: `url("/background.png")`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        color: 'white',
        boxSizing: 'border-box',
        padding: '20px',
        fontFamily: '',
        overflow: 'auto',
      }}
    >
      <img src="/logo.svg" style={{ width: '160px', margin: '40px 0' }} alt="" />
      <div style={{ fontSize: '5em', fontWeight: 'bold' }}>404</div>
      <br />
      <div style={{ fontSize: '2em', fontWeight: 'bold' }}>Page Not Found</div>
      <br />
      <br />
      <div style={{ fontSize: '1em', lineHeight: '1.5em', textAlign: 'center' }}>
        Oops! The page you're looking for doesn't exist.
      </div>
    </div>
  );
}

export default NotFound;
