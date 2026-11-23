import React from 'react'
import {act, render, screen} from '@testing-library/react'
import {StoreRouteThemeCtx} from '../Share.fixture'
import useStore from '../store/useStore'
import LoadingBackdrop from './LoadingBackdrop'


describe('LoadingBackdrop', () => {
  afterEach(() => {
    act(() => {
      useStore.setState({isModelLoading: false, indexedModel: null, isFirstMeshShown: false})
    })
  })

  // MUI's Backdrop keeps its node mounted; `open` shows as visibility.
  const isShown = () => screen.getByTestId('LoadingBackdrop').style.visibility !== 'hidden'

  it('covers the viewer while a model loads', () => {
    act(() => {
      useStore.setState({isModelLoading: true, indexedModel: null})
    })
    render(<StoreRouteThemeCtx><LoadingBackdrop/></StoreRouteThemeCtx>)
    expect(isShown()).toBe(true)
  })

  // open-205 #2029: from the index on, the tree, properties and search are
  // live while geometry still streams, and a dimmer over them would swallow
  // every click.
  it('lifts once the loading model is indexed', () => {
    act(() => {
      useStore.setState({isModelLoading: true, indexedModel: {isIndexedModel: true}})
    })
    render(<StoreRouteThemeCtx><LoadingBackdrop/></StoreRouteThemeCtx>)
    expect(isShown()).toBe(false)
  })

  // open-205 #2043: a progressive load's first preview mesh lands during the
  // parse, long before the index on a large model, and from then on the
  // camera and scene picks are live.
  it('lifts at the load\'s first mesh, before the index', () => {
    act(() => {
      useStore.setState({isModelLoading: true, indexedModel: null, isFirstMeshShown: true})
    })
    render(<StoreRouteThemeCtx><LoadingBackdrop/></StoreRouteThemeCtx>)
    expect(isShown()).toBe(false)
  })

  it('the next load starts covered: a load that ends clears its first mesh', () => {
    act(() => {
      useStore.setState({isModelLoading: true, indexedModel: null, isFirstMeshShown: true})
      useStore.getState().setIsModelLoading(false)
      useStore.getState().setIsModelLoading(true)
    })
    expect(useStore.getState().isFirstMeshShown).toBe(false)
    render(<StoreRouteThemeCtx><LoadingBackdrop/></StoreRouteThemeCtx>)
    expect(isShown()).toBe(true)
  })
})
